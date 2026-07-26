import type { Permission, Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    role: Role;
    locationId?: string | null;
    departmentId?: string | null;
    permissions?: Permission[];
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      locationId?: string | null;
      departmentId?: string | null;
      permissions?: Permission[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    locationId?: string | null;
    departmentId?: string | null;
    permissions?: Permission[];
  }
}
