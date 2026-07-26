import { PrismaClient, Role, LocationType, TicketStatus, TicketPriority, TicketSource, WorkType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Dev-only seed password for every seeded account.
const DEV_PASSWORD = "password123";

async function main() {
  const alreadySeeded = await prisma.location.count();
  if (alreadySeeded > 0) {
    console.log("Database already has Location rows — skipping seed to avoid duplicates.");
    return;
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  // ── Locations (Corporate HQ -> Regional Hub -> Branches) ──
  const hq = await prisma.location.create({
    data: { name: "Springfield HQ", type: LocationType.CORPORATE_HQ, address: "100 Industrial Pkwy, Springfield, IL" },
  });
  const midwestHub = await prisma.location.create({
    data: { name: "Midwest Regional Hub", type: LocationType.REGIONAL_HUB, parentId: hq.id, address: "1 Hub Plaza, Springfield, IL" },
  });
  const rockford = await prisma.location.create({
    data: { name: "Rockford Branch", type: LocationType.BRANCH, parentId: midwestHub.id, address: "455 Willow Ave, Rockford, IL" },
  });
  const peoria = await prisma.location.create({
    data: { name: "Peoria Branch", type: LocationType.BRANCH, parentId: midwestHub.id, address: "9 Courthouse Sq, Peoria, IL" },
  });

  // ── Users (created manager-first so managerId can reference an
  // already-created row) — departmentId is set in a second pass below,
  // once Departments (which themselves reference a manager) exist. ──
  const priya = await prisma.user.create({
    data: { email: "priya.admin@example.com", name: "Priya Shah", title: "IT Director", role: Role.SUPER_ADMIN, passwordHash, locationId: hq.id },
  });
  const marcus = await prisma.user.create({
    data: { email: "marcus.manager@example.com", name: "Marcus Webb", title: "IT Service Manager", role: Role.DEPARTMENT_MANAGER, passwordHash, locationId: hq.id, managerId: priya.id },
  });
  const grace = await prisma.user.create({
    data: { email: "grace.manager@example.com", name: "Grace Kim", title: "Facilities Manager", role: Role.DEPARTMENT_MANAGER, passwordHash, locationId: hq.id, managerId: priya.id },
  });
  const felicia = await prisma.user.create({
    data: { email: "felicia.manager@example.com", name: "Felicia Chen", title: "HR Manager", role: Role.DEPARTMENT_MANAGER, passwordHash, locationId: hq.id, managerId: priya.id },
  });
  const victor = await prisma.user.create({
    data: { email: "victor.manager@example.com", name: "Victor Alonso", title: "Finance Manager", role: Role.DEPARTMENT_MANAGER, passwordHash, locationId: hq.id, managerId: priya.id },
  });
  const wendy = await prisma.user.create({
    data: { email: "wendy.manager@example.com", name: "Wendy Park", title: "Operations Manager", role: Role.DEPARTMENT_MANAGER, passwordHash, locationId: hq.id, managerId: priya.id },
  });
  const rachel = await prisma.user.create({
    data: { email: "rachel.manager@example.com", name: "Rachel Ford", title: "Sales Manager", role: Role.DEPARTMENT_MANAGER, passwordHash, locationId: peoria.id, managerId: priya.id },
  });
  const ivy = await prisma.user.create({
    data: { email: "ivy.manager@example.com", name: "Ivy Chen", title: "Engineering Manager", role: Role.DEPARTMENT_MANAGER, passwordHash, locationId: hq.id, managerId: priya.id },
  });
  const dana = await prisma.user.create({
    data: { email: "dana.admin@example.com", name: "Dana Reyes", title: "Rockford Branch Manager", role: Role.LOCATION_ADMIN, passwordHash, locationId: rockford.id, managerId: wendy.id },
  });
  const alice = await prisma.user.create({
    data: { email: "alice.employee@example.com", name: "Alice Nguyen", title: "IT Support Specialist", role: Role.EMPLOYEE, passwordHash, locationId: hq.id, managerId: marcus.id },
  });
  const ben = await prisma.user.create({
    data: { email: "ben.employee@example.com", name: "Ben Torres", title: "IT Support Specialist", role: Role.EMPLOYEE, passwordHash, locationId: rockford.id, managerId: marcus.id },
  });
  const henry = await prisma.user.create({
    data: { email: "henry.employee@example.com", name: "Henry Diaz", title: "Facilities Coordinator", role: Role.EMPLOYEE, passwordHash, locationId: hq.id, managerId: grace.id },
  });
  const omar = await prisma.user.create({
    data: { email: "omar.employee@example.com", name: "Omar Haddad", title: "HR Generalist", role: Role.EMPLOYEE, passwordHash, locationId: hq.id, managerId: felicia.id },
  });
  const paula = await prisma.user.create({
    data: { email: "paula.employee@example.com", name: "Paula Kowalski", title: "Accounts Payable", role: Role.EMPLOYEE, passwordHash, locationId: hq.id, managerId: victor.id },
  });
  const sam = await prisma.user.create({
    data: { email: "sam.employee@example.com", name: "Sam Whitfield", title: "Sales Associate", role: Role.EMPLOYEE, passwordHash, locationId: peoria.id, managerId: rachel.id },
  });
  const nina = await prisma.user.create({
    data: { email: "nina.employee@example.com", name: "Nina Alvarez", title: "Engineering Associate", role: Role.EMPLOYEE, passwordHash, locationId: rockford.id, managerId: ivy.id },
  });

  // ── Departments (org units — distinct from ticket Boards below) ──
  const itDept = await prisma.department.create({ data: { name: "IT", managerId: marcus.id } });
  const facilitiesDept = await prisma.department.create({ data: { name: "Facilities", managerId: grace.id } });
  const hrDept = await prisma.department.create({ data: { name: "HR", managerId: felicia.id } });
  const financeDept = await prisma.department.create({ data: { name: "Finance", managerId: victor.id } });
  const operationsDept = await prisma.department.create({ data: { name: "Operations", managerId: wendy.id } });
  const salesDept = await prisma.department.create({ data: { name: "Sales", managerId: rachel.id } });
  const engineeringDept = await prisma.department.create({ data: { name: "Engineering", managerId: ivy.id } });

  await Promise.all([
    prisma.user.update({ where: { id: priya.id }, data: { departmentId: itDept.id } }),
    prisma.user.update({ where: { id: marcus.id }, data: { departmentId: itDept.id } }),
    prisma.user.update({ where: { id: alice.id }, data: { departmentId: itDept.id } }),
    prisma.user.update({ where: { id: ben.id }, data: { departmentId: itDept.id } }),
    prisma.user.update({ where: { id: grace.id }, data: { departmentId: facilitiesDept.id } }),
    prisma.user.update({ where: { id: henry.id }, data: { departmentId: facilitiesDept.id } }),
    prisma.user.update({ where: { id: felicia.id }, data: { departmentId: hrDept.id } }),
    prisma.user.update({ where: { id: omar.id }, data: { departmentId: hrDept.id } }),
    prisma.user.update({ where: { id: victor.id }, data: { departmentId: financeDept.id } }),
    prisma.user.update({ where: { id: paula.id }, data: { departmentId: financeDept.id } }),
    prisma.user.update({ where: { id: wendy.id }, data: { departmentId: operationsDept.id } }),
    prisma.user.update({ where: { id: dana.id }, data: { departmentId: operationsDept.id } }),
    prisma.user.update({ where: { id: rachel.id }, data: { departmentId: salesDept.id } }),
    prisma.user.update({ where: { id: sam.id }, data: { departmentId: salesDept.id } }),
    prisma.user.update({ where: { id: ivy.id }, data: { departmentId: engineeringDept.id } }),
    prisma.user.update({ where: { id: nina.id }, data: { departmentId: engineeringDept.id } }),
  ]);

  // ── Boards (service queues, each owned by a Department) ──
  const itHelpdesk = await prisma.board.create({ data: { name: "IT Helpdesk", description: "Hardware, software, and network support requests", departmentId: itDept.id } });
  const facilitiesBoard = await prisma.board.create({ data: { name: "Facilities & Maintenance", description: "Building, equipment, and workspace requests", departmentId: facilitiesDept.id } });
  const hrBoard = await prisma.board.create({ data: { name: "HR Requests", description: "Onboarding, benefits, and employee relations requests", departmentId: hrDept.id } });
  const financeBoard = await prisma.board.create({ data: { name: "Finance/Procurement", description: "Purchase approvals, reimbursements, and vendor requests", departmentId: financeDept.id } });
  const operationsBoard = await prisma.board.create({ data: { name: "Operations", description: "General operational and event-support requests", departmentId: operationsDept.id } });

  // ── Categories (with sub-categories) ──────────────────
  const networkCat = await prisma.category.create({ data: { name: "Network" } });
  const [wifiCat, vpnCat] = await Promise.all([
    prisma.category.create({ data: { name: "Wi-Fi", parentId: networkCat.id } }),
    prisma.category.create({ data: { name: "VPN", parentId: networkCat.id } }),
  ]);

  const hardwareCat = await prisma.category.create({ data: { name: "Hardware" } });
  const [desktopCat, printerCat] = await Promise.all([
    prisma.category.create({ data: { name: "Desktop", parentId: hardwareCat.id } }),
    prisma.category.create({ data: { name: "Printer", parentId: hardwareCat.id } }),
  ]);

  const softwareCat = await prisma.category.create({ data: { name: "Software" } });
  const [emailCat, licensingCat] = await Promise.all([
    prisma.category.create({ data: { name: "Email", parentId: softwareCat.id } }),
    prisma.category.create({ data: { name: "Licensing", parentId: softwareCat.id } }),
  ]);

  // ── Tickets ────────────────────────────────────────────
  const ticketDefs = [
    { title: "VPN drops intermittently for remote workers", description: "Multiple employees report VPN disconnects every 20-30 minutes since Monday.", board: itHelpdesk, location: hq, requester: paula, category: vpnCat, status: TicketStatus.IN_PROGRESS, priority: TicketPriority.HIGH, source: TicketSource.EMAIL, assignee: alice },
    { title: "New hire laptop setup", description: "Provision a new laptop for an incoming HR new hire starting next Monday.", board: itHelpdesk, location: hq, requester: omar, category: desktopCat, status: TicketStatus.OPEN, priority: TicketPriority.MEDIUM, source: TicketSource.PORTAL, assignee: ben },
    { title: "Printer offline in accounting", description: "Front-desk printer shows offline; accounting can't print invoices.", board: itHelpdesk, location: hq, requester: paula, category: printerCat, status: TicketStatus.WAITING_ON_REQUESTER, priority: TicketPriority.MEDIUM, source: TicketSource.PORTAL, assignee: ben },
    { title: "Conference room projector won't pair", description: "Wireless presentation dongle won't connect to the new display.", board: facilitiesBoard, location: hq, requester: henry, category: null, status: TicketStatus.OPEN, priority: TicketPriority.LOW, source: TicketSource.EMAIL, assignee: null },
    { title: "HVAC noise in break room", description: "Loud rattling noise from the break room vent since this morning.", board: facilitiesBoard, location: rockford, requester: ben, category: null, status: TicketStatus.OPEN, priority: TicketPriority.LOW, source: TicketSource.PORTAL, assignee: null },
    { title: "New employee badge access request", description: "Need building badge access provisioned before start date.", board: hrBoard, location: peoria, requester: sam, category: null, status: TicketStatus.OPEN, priority: TicketPriority.MEDIUM, source: TicketSource.PORTAL, assignee: omar },
    { title: "Benefits enrollment question", description: "Question about open enrollment deadline and dependent coverage.", board: hrBoard, location: rockford, requester: nina, category: null, status: TicketStatus.RESOLVED, priority: TicketPriority.LOW, source: TicketSource.EMAIL, assignee: omar },
    { title: "Expense report reimbursement delay", description: "Submitted expense report two weeks ago, reimbursement hasn't posted.", board: financeBoard, location: peoria, requester: sam, category: null, status: TicketStatus.IN_PROGRESS, priority: TicketPriority.MEDIUM, source: TicketSource.PORTAL, assignee: paula },
    { title: "Purchase order approval needed for new laptops", description: "Need a PO cut for 5 replacement laptops for the IT refresh cycle.", board: financeBoard, location: hq, requester: marcus, category: null, status: TicketStatus.OPEN, priority: TicketPriority.MEDIUM, source: TicketSource.MANUAL, assignee: victor },
    { title: "Server room AC alarm — investigate", description: "Monitoring alert for elevated temperature in the HQ server closet.", board: operationsBoard, location: hq, requester: alice, category: null, status: TicketStatus.OPEN, priority: TicketPriority.EMERGENCY, source: TicketSource.MANUAL, assignee: alice },
    { title: "Company all-hands AV setup", description: "Need AV configured in the main conference room for Friday's all-hands.", board: operationsBoard, location: hq, requester: wendy, category: null, status: TicketStatus.CLOSED, priority: TicketPriority.LOW, source: TicketSource.EMAIL, assignee: dana },
    { title: "Password reset — locked out of email", description: "Locked out of mailbox after too many failed login attempts.", board: itHelpdesk, location: rockford, requester: nina, category: emailCat, status: TicketStatus.CLOSED, priority: TicketPriority.MEDIUM, source: TicketSource.PHONE, assignee: alice },
  ];

  const tickets = [];
  for (const t of ticketDefs) {
    const ticket = await prisma.ticket.create({
      data: {
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        source: t.source,
        boardId: t.board.id,
        locationId: t.location.id,
        requesterId: t.requester.id,
        assigneeId: t.assignee?.id ?? null,
        categoryId: t.category?.id ?? null,
        resolvedAt: t.status === TicketStatus.RESOLVED || t.status === TicketStatus.CLOSED ? new Date() : null,
        closedAt: t.status === TicketStatus.CLOSED ? new Date() : null,
      },
    });
    tickets.push(ticket);
  }

  // ── Ticket Comments ────────────────────────────────────
  await prisma.ticketComment.createMany({
    data: [
      { ticketId: tickets[0].id, authorId: alice.id, body: "Pulled logs from the VPN concentrator, checking for a firmware issue.", isInternal: true },
      { ticketId: tickets[0].id, authorId: paula.id, body: "Thanks for looking into this — it's happening to at least 5 of us." },
      { ticketId: tickets[2].id, authorId: ben.id, body: "Confirmed printer needs a new fuser unit, ordering part.", isInternal: true },
      { ticketId: tickets[6].id, authorId: omar.id, body: "Enrollment deadline is the 30th — sent the dependent coverage form separately." },
      { ticketId: tickets[11].id, authorId: nina.id, body: "All set, I'm back in — thank you for the quick turnaround!" },
    ],
  });

  // ── CSAT Response ──────────────────────────────────────
  // tickets[11] is a CLOSED ticket — a real app close would trigger this via
  // lib/csat.ts; seeded directly here since seed data bypasses the Server
  // Action entirely.
  await prisma.csatResponse.create({
    data: {
      ticketId: tickets[11].id,
      rating: 5,
      comment: "Fast response, walked me through it clearly. Thanks!",
      sentAt: new Date(),
      respondedAt: new Date(),
    },
  });

  // ── Time Logs ──────────────────────────────────────────
  await prisma.timeLog.createMany({
    data: [
      { ticketId: tickets[0].id, userId: alice.id, startTime: new Date("2025-07-08T14:00:00Z"), endTime: new Date("2025-07-08T15:30:00Z"), durationMinutes: 90, workType: WorkType.REMOTE, notesInternal: "Investigated VPN concentrator logs, updated firmware." },
      { ticketId: tickets[9].id, userId: alice.id, startTime: new Date("2025-07-09T09:00:00Z"), endTime: new Date("2025-07-09T09:45:00Z"), durationMinutes: 45, workType: WorkType.ONSITE, notesInternal: "Checked server room AC unit, reset alarm threshold." },
      { ticketId: tickets[8].id, userId: victor.id, startTime: new Date("2025-07-10T11:00:00Z"), endTime: new Date("2025-07-10T12:00:00Z"), durationMinutes: 60, workType: WorkType.ADMIN, notesInternal: "Reviewed PO request against Q3 hardware budget." },
      { ticketId: tickets[11].id, userId: alice.id, startTime: new Date("2025-07-05T16:00:00Z"), endTime: new Date("2025-07-05T16:15:00Z"), durationMinutes: 15, workType: WorkType.ADMIN, notesInternal: "Quick password reset." },
    ],
  });

  // ── Assets ───────────────────────────────────────────────
  // Default, top-level asset categories — admins can add more from
  // /admin/asset-categories, this is just a reasonable starting taxonomy.
  await prisma.assetCategory.createMany({
    data: ["Workstation", "Laptop", "Server", "Network Device", "Printer", "Mobile Device", "Other"].map((name) => ({ name })),
  });
  const assetCategories = await prisma.assetCategory.findMany();
  const assetCategoryId = (name: string) => {
    const category = assetCategories.find((c) => c.name === name);
    if (!category) throw new Error(`Asset category "${name}" not found`);
    return category.id;
  };

  const [hqServer, hqFirewall, rockfordWorkstation] = await Promise.all([
    prisma.asset.create({
      data: { locationId: hq.id, categoryId: assetCategoryId("Server"), name: "HQ-FS01 (File Server)", serialNumber: "SN-88213" },
    }),
    prisma.asset.create({
      data: { locationId: hq.id, categoryId: assetCategoryId("Network Device"), name: "HQ Firewall", serialNumber: "SN-77102" },
    }),
    prisma.asset.create({
      data: { locationId: rockford.id, categoryId: assetCategoryId("Workstation"), name: "Rockford Front Desk PC", serialNumber: "SN-55901" },
    }),
  ]);

  await prisma.ticketAsset.createMany({
    data: [
      { ticketId: tickets[0].id, assetId: hqFirewall.id }, // "VPN drops intermittently for remote workers"
      { ticketId: tickets[9].id, assetId: hqServer.id }, // "Server room AC alarm — investigate"
      { ticketId: tickets[11].id, assetId: rockfordWorkstation.id }, // "Password reset — locked out of email"
    ],
  });

  // ── Scheduled Visits ─────────────────────────────────────
  // Relative to seed-run time, not fixed 2025 dates like TimeLogs — a
  // scheduled visit is forward-looking, so a freshly seeded DB should show
  // something in the current/next week no matter when seed runs.
  const seedNow = new Date();
  const addHours = (base: Date, hours: number) => new Date(base.getTime() + hours * 60 * 60 * 1000);

  await prisma.scheduledVisit.createMany({
    data: [
      {
        ticketId: tickets[9].id, // "Server room AC alarm — investigate"
        technicianId: alice.id,
        startTime: addHours(seedNow, 4),
        endTime: addHours(seedNow, 5),
        location: "HQ — Server Room",
      },
      {
        ticketId: tickets[4].id, // "HVAC noise in break room"
        technicianId: ben.id,
        startTime: addHours(seedNow, 26),
        endTime: addHours(seedNow, 28),
        location: "Rockford Branch — Break Room",
      },
    ],
  });

  // ── Canned Responses ───────────────────────────────────
  await prisma.cannedResponse.createMany({
    data: [
      {
        title: "Ticket Received Acknowledgement",
        body: "Hi {{requester_name}}, thanks for reaching out. We've logged your request as ticket {{ticket_id}} and someone will be in touch shortly.",
        boardId: null,
        createdById: marcus.id,
      },
      {
        title: "Resolution Follow-up",
        body: "Hi {{requester_name}}, we've marked ticket {{ticket_id}} as resolved. Please let us know if the issue resurfaces and we'll reopen it right away.",
        boardId: itHelpdesk.id,
        createdById: marcus.id,
      },
    ],
  });

  // ── KB Articles ─────────────────────────────────────────
  await prisma.kbArticle.createMany({
    data: [
      {
        title: "How to reset your Wi-Fi connection",
        body: "1. Forget the network in your Wi-Fi settings.\n2. Reconnect using the office SSID and password from IT.\n3. If Wi-Fi still doesn't appear, file a ticket and reference this article.",
        boardId: itHelpdesk.id,
        categoryId: wifiCat.id,
        isInternal: false,
        createdById: alice.id,
      },
      {
        title: "Requesting a new firewall rule",
        body: "File a ticket on the IT Helpdesk board with: the destination IP/hostname, port(s), and protocol needed, plus the business reason. Firewall changes are batched and applied during the next maintenance window unless marked EMERGENCY.",
        boardId: itHelpdesk.id,
        categoryId: vpnCat.id,
        isInternal: false,
        createdById: ben.id,
      },
      {
        title: "Internal: endpoint agent reinstall procedure",
        body: "1. Uninstall the existing agent via Programs & Features.\n2. Delete leftover files in %ProgramData%\\Agent.\n3. Reboot before reinstalling — a reinstall over a half-removed agent is the #1 cause of duplicate device records in the console.",
        boardId: null,
        categoryId: desktopCat.id,
        isInternal: true,
        createdById: alice.id,
      },
    ],
  });

  // ── SLA Policies (one per priority) ────────────────────
  await prisma.slaPolicy.createMany({
    data: [
      { priority: TicketPriority.LOW, responseTargetMinutes: 480, resolutionTargetMinutes: 4320 },
      { priority: TicketPriority.MEDIUM, responseTargetMinutes: 240, resolutionTargetMinutes: 1440 },
      { priority: TicketPriority.HIGH, responseTargetMinutes: 60, resolutionTargetMinutes: 480 },
      { priority: TicketPriority.EMERGENCY, responseTargetMinutes: 15, resolutionTargetMinutes: 240 },
    ],
  });

  // ── Automation Rules (IFTTT-style) ─────────────────────
  await prisma.automationRule.createMany({
    data: [
      {
        name: "Auto-assign Emergency tickets to Alice",
        triggerType: "TICKET_CREATED",
        conditionPriority: TicketPriority.EMERGENCY,
        actionType: "ASSIGN_TECHNICIAN",
        actionAssigneeId: alice.id,
      },
      {
        name: "Notify on IT Helpdesk status change",
        triggerType: "STATUS_CHANGED",
        conditionBoardId: itHelpdesk.id,
        actionType: "SEND_EMAIL_NOTIFICATION",
      },
      {
        name: "Escalate idle Emergency tickets to Marcus",
        triggerType: "IDLE_TIME_EXCEEDED",
        conditionPriority: TicketPriority.EMERGENCY,
        conditionIdleMinutes: 60,
        actionType: "ASSIGN_TECHNICIAN",
        actionAssigneeId: marcus.id,
      },
    ],
  });

  console.log("Seed complete:");
  console.log("  Locations: 4 (1 HQ, 1 regional hub, 2 branches)");
  console.log("  Departments: 7 (IT, Facilities, HR, Finance, Operations, Sales, Engineering)");
  console.log("  Users: 15 across all 4 roles, Boards: 5, Categories: 9 (3 parent + 6 sub)");
  console.log(`  Tickets: ${tickets.length}, TicketComments: 5, TimeLogs: 4, CannedResponses: 2, KbArticles: 3, Assets: 3 (+3 TicketAsset links), ScheduledVisits: 2`);
  console.log("  SlaPolicies: 4 (one per priority), AutomationRules: 3 (incl. 1 idle-time)");
  console.log(`  Dev login password for all seeded accounts: "${DEV_PASSWORD}"`);
  console.log("  SUPER_ADMIN: priya.admin@example.com");
  console.log("  DEPARTMENT_MANAGER: marcus.manager@example.com / grace.manager@example.com / felicia.manager@example.com / victor.manager@example.com / wendy.manager@example.com / rachel.manager@example.com / ivy.manager@example.com");
  console.log("  LOCATION_ADMIN: dana.admin@example.com");
  console.log("  EMPLOYEE: alice.employee@example.com / ben.employee@example.com / henry.employee@example.com / omar.employee@example.com / paula.employee@example.com / sam.employee@example.com / nina.employee@example.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
