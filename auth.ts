import NextAuth from "next-auth";
import type { Provider } from "@auth/core/providers";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Okta from "next-auth/providers/okta";
import bcrypt from "bcryptjs";
import authConfig from "./auth.config";
import { prisma } from "@/lib/prisma";

// Refetched on every request alongside the isActive re-check below, not
// cached in the token beyond that — an admin revoking a group should take
// effect on the user's very next page load, not just their next login.
async function loadPermissions(userId: string) {
  const memberships = await prisma.userPermissionGroup.findMany({
    where: { userId },
    select: { group: { select: { permissions: true } } },
  });
  return Array.from(new Set(memberships.flatMap((m) => m.group.permissions)));
}

// SSO scaffolding: an OAuth/OIDC provider is only added when its env vars are
// actually set, so a deployment with none configured behaves exactly like
// before (Credentials-only) — same opt-in-by-env-var shape as
// STORAGE_DRIVER=s3 (lib/storage.ts). No live IdP exists in this environment
// to test a real handshake against; the signIn/jwt wiring below is exercised
// directly (see the account-linking note on signIn), not through an actual
// Azure AD/Okta login.
const providers: Provider[] = [
  Credentials({
    id: "login",
    name: "Login",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = credentials?.email;
      const password = credentials?.password;
      if (typeof email !== "string" || typeof password !== "string") return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.isActive || !user.passwordHash) return null;

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        locationId: user.locationId,
        departmentId: user.departmentId,
      };
    },
  }),
];

if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET && process.env.AZURE_AD_TENANT_ID) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
    })
  );
}

if (process.env.OKTA_CLIENT_ID && process.env.OKTA_CLIENT_SECRET && process.env.OKTA_ISSUER) {
  providers.push(
    Okta({
      clientId: process.env.OKTA_CLIENT_ID,
      clientSecret: process.env.OKTA_CLIENT_SECRET,
      issuer: process.env.OKTA_ISSUER,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // This app has pre-provisioned employees, not open signup — an IdP
    // authenticating someone is not, by itself, authorization to use this
    // app. The Credentials provider already fully verifies identity inside
    // authorize() (email + password + isActive), so it's exempted here;
    // every OAuth/OIDC provider must additionally resolve to an existing,
    // active User row by email, or sign-in is rejected outright.
    async signIn({ user, account }) {
      if (account?.provider === "login") return true;
      if (!user.email) return false;

      const existing = await prisma.user.findUnique({ where: { email: user.email }, select: { isActive: true } });
      return existing?.isActive ?? false;
    },
    // authConfig's jwt() (Edge-safe, no Prisma) only runs the branch that
    // stamps claims onto a *fresh* token at sign-in. This Node-only override
    // adds the other half: on every subsequent request, confirm the
    // underlying User row still exists and is still allowed to log in.
    // Without this, a token signed before a DB reset/reseed — or a
    // since-deactivated account — keeps looking "valid" (the signature still
    // checks out) right up until the first write that trusts
    // session.user.id as a foreign key, which then 500s with a raw Prisma
    // constraint violation instead of bouncing the user back to /login.
    // Returning null here ends the session cleanly.
    async jwt({ token, user, account }) {
      if (user) {
        // Credentials' authorize() already returns our own User row's shape
        // directly (id/role/locationId/departmentId all set). An OAuth
        // provider's `user` is just its own profile (email/name and a
        // provider-specific id, e.g. Azure's `oid`) — signIn() above already
        // confirmed a matching active User exists by email, so look it up
        // again here and stamp *our* id onto the token as `sub`. Everything
        // downstream (session.user.id, every `where: { id: session.user.id }`
        // query) assumes that id is a User.id regardless of how someone
        // signed in — it must never be left as a provider-specific id.
        if (account?.provider !== "login") {
          const dbUser = await prisma.user.findUniqueOrThrow({ where: { email: user.email! } });
          token.sub = dbUser.id;
          token.role = dbUser.role;
          token.locationId = dbUser.locationId ?? undefined;
          token.departmentId = dbUser.departmentId ?? undefined;
          token.permissions = await loadPermissions(dbUser.id);
          return token;
        }

        token.role = user.role;
        token.locationId = user.locationId;
        token.departmentId = user.departmentId;
        token.permissions = await loadPermissions(user.id!);
        return token;
      }

      const stillValid = await prisma.user.findUnique({
        where: { id: token.sub! },
        select: { isActive: true, role: true, locationId: true, departmentId: true },
      });
      if (!stillValid?.isActive) return null;
      token.role = stillValid.role;
      token.locationId = stillValid.locationId ?? undefined;
      token.departmentId = stillValid.departmentId ?? undefined;
      token.permissions = await loadPermissions(token.sub!);

      return token;
    },
  },
  providers,
});
