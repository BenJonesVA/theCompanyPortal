import { Permission } from "@prisma/client";

export function getPermissionCatalog(): { key: Permission; label: string; description: string }[] {
  return [
    {
      key: Permission.MANAGE_USERS,
      label: "Manage users",
      description: "Create, edit, and deactivate user accounts. Normally SUPER_ADMIN-only — grant with care.",
    },
    {
      key: Permission.MANAGE_BOARDS,
      label: "Manage boards",
      description: "Create, edit, and delete ticket boards.",
    },
    {
      key: Permission.MANAGE_LOCATIONS,
      label: "Manage locations",
      description: "Create and edit locations and their employees.",
    },
    {
      key: Permission.MANAGE_DEPARTMENTS,
      label: "Manage departments",
      description: "Create and edit org departments and their managers.",
    },
    {
      key: Permission.MANAGE_ASSETS,
      label: "Manage assets",
      description: "Create, edit, and delete assets.",
    },
    {
      key: Permission.MANAGE_CATEGORIES,
      label: "Manage categories",
      description: "Edit the ticket category and asset category hierarchies.",
    },
    {
      key: Permission.MANAGE_AUTOMATION,
      label: "Manage automation rules",
      description: "Create and toggle automation rules.",
    },
    {
      key: Permission.MANAGE_SLA,
      label: "Manage SLA policies",
      description: "Edit response/resolution time targets per priority.",
    },
    {
      key: Permission.MANAGE_CANNED_RESPONSES,
      label: "Manage canned responses",
      description: "Create and edit reusable reply templates.",
    },
    {
      key: Permission.MANAGE_TICKET_TEMPLATES,
      label: "Manage ticket templates",
      description: "Create and edit prefilled templates for new tickets.",
    },
    {
      key: Permission.MANAGE_BRANDING,
      label: "Manage branding",
      description: "Edit company name, logo, and tagline.",
    },
    {
      key: Permission.MANAGE_LOCATION_PAGES,
      label: "Manage location pages",
      description: "Edit a location's landing-page banner, widgets, and floor plan.",
    },
    {
      key: Permission.MANAGE_APPROVAL_WORKFLOWS,
      label: "Manage approval workflows",
      description: "Create and edit multi-stage approval workflow templates.",
    },
    {
      key: Permission.MANAGE_NEWS,
      label: "Manage news",
      description: "Author, target, and publish company news posts.",
    },
    {
      key: Permission.VIEW_REPORTS,
      label: "View reports",
      description: "Access the Reports dashboard (SLA compliance, utilization, CSAT, etc.).",
    },
  ];
}
