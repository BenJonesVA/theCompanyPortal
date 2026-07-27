import { runApprovalReminderSweep } from "@/lib/approval-notifications";
import { assertCronAuthorized, CronAuthError } from "@/lib/cron-auth";

// Reminder + escalation sweep for the Approval Workflow Engine — see
// lib/approval-notifications.ts for thresholds. The "new pending approval"
// notification itself fires synchronously from app/portal/approvals/actions.ts
// and app/approve/[token]/actions.ts right after each state transition; this
// sweep only handles staleness (reminders) and stuck stages (escalation), plus
// a self-heal re-check for any never-notified row those direct calls missed.
export async function GET(request: Request) {
  try {
    assertCronAuthorized(request);
  } catch (err) {
    if (err instanceof CronAuthError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const result = await runApprovalReminderSweep();
  return Response.json({ ...result, ranAt: new Date().toISOString() });
}
