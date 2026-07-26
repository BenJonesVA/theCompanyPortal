import Link from "next/link";
import { redirect } from "next/navigation";
import { Permission, Role } from "@prisma/client";
import { requireAuth } from "@/lib/rbac";
import { Card } from "@/components/ui/card";

type Section = {
  href: string;
  label: string;
  description: string;
  // Roles that see this card regardless of any granted permission. Defaults
  // to SUPER_ADMIN/DEPARTMENT_MANAGER — set explicitly (e.g. Users:
  // [SUPER_ADMIN]) to narrow it.
  roles?: Role[];
  // A permission that also unlocks this card, additively, for any role that
  // holds it (e.g. an EMPLOYEE granted MANAGE_SLA). Omit for cards that must
  // stay role-locked no matter what a permission group grants — Permission
  // Groups management itself is the one case that matters here, since
  // letting a permission unlock it would let a permissioned user grant
  // themselves more access than a SUPER_ADMIN gave them.
  permission?: Permission;
};

const DEFAULT_ROLES: Role[] = [Role.SUPER_ADMIN, Role.DEPARTMENT_MANAGER];

const SECTIONS: Section[] = [
  {
    href: "/admin/branding",
    label: "Branding",
    description: "Company name, tagline, and logo shown across the app and sign-in page.",
    permission: Permission.MANAGE_BRANDING,
  },
  {
    href: "/locations",
    label: "Locations",
    description: "Corporate HQ, regional hubs, and branch offices.",
    permission: Permission.MANAGE_LOCATIONS,
  },
  {
    href: "/admin/departments",
    label: "Departments",
    description: "Org units (Engineering, HR, Finance, ...) and their managers.",
    permission: Permission.MANAGE_DEPARTMENTS,
  },
  {
    href: "/admin/categories",
    label: "Categories",
    description: "Ticket taxonomy used on tickets and knowledge base articles.",
    permission: Permission.MANAGE_CATEGORIES,
  },
  {
    href: "/admin/asset-categories",
    label: "Asset Categories",
    description: "Asset taxonomy used across locations' assets.",
    permission: Permission.MANAGE_CATEGORIES,
  },
  {
    href: "/admin/canned-responses",
    label: "Canned Responses",
    description: "Reusable reply templates available when responding to tickets.",
    permission: Permission.MANAGE_CANNED_RESPONSES,
  },
  {
    href: "/admin/ticket-templates",
    label: "Ticket Templates",
    description: "Prefilled content staff can start a new ticket from.",
    permission: Permission.MANAGE_TICKET_TEMPLATES,
  },
  {
    href: "/boards",
    label: "Boards",
    description: "Ticket boards — create, rename, and activate/deactivate.",
    permission: Permission.MANAGE_BOARDS,
  },
  {
    href: "/admin/users",
    label: "Users",
    description: "Employee accounts, roles, and access.",
    roles: [Role.SUPER_ADMIN],
    permission: Permission.MANAGE_USERS,
  },
  {
    href: "/admin/permission-groups",
    label: "Permission Groups",
    description: "Named bundles of extra capabilities, assignable to any user.",
    roles: [Role.SUPER_ADMIN],
  },
  {
    href: "/admin/sla",
    label: "SLA Policies",
    description: "Response and resolution targets per ticket priority.",
    permission: Permission.MANAGE_SLA,
  },
  {
    href: "/automation",
    label: "Automation",
    description: "IFTTT-style rules that react to ticket events.",
    permission: Permission.MANAGE_AUTOMATION,
  },
];

export default async function AdminHubPage() {
  const user = await requireAuth();

  const canSee = (section: Section) =>
    (section.roles ?? DEFAULT_ROLES).includes(user.role!) ||
    (section.permission !== undefined && (user.permissions?.includes(section.permission) ?? false));

  const sections = SECTIONS.filter(canSee);

  if (sections.length === 0) {
    redirect("/unauthorized");
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-[24px] font-bold tracking-tight text-fg">Admin</h1>
        <p className="mt-[3px] text-[13.5px] text-fg-muted">
          Configure and customize this portal.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {sections.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full p-4 transition-colors hover:bg-surface-2">
              <div className="text-[14.5px] font-semibold text-fg">{section.label}</div>
              <p className="mt-1 text-[12.5px] text-fg-muted">{section.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
