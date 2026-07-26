import type { NextAuthConfig } from "next-auth";

// Edge-safe config only: no bcrypt, no Prisma. This is imported by both
// `middleware.ts` (Edge runtime) and `auth.ts` (Node runtime, adds the provider).
export default {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.locationId = user.locationId;
        token.departmentId = user.departmentId;
        token.permissions = user.permissions;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      session.user.role = token.role;
      session.user.locationId = token.locationId;
      session.user.departmentId = token.departmentId;
      session.user.permissions = token.permissions;
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
} satisfies NextAuthConfig;
