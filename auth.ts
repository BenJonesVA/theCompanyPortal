import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
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
    async jwt({ token, user }) {
      if (user) {
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
  providers: [
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
  ],
});
