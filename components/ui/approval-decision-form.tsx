"use client";

import { useActionState } from "react";
import { Button } from "./button";
import type { FormActionState } from "./action-form";

// Two useActionState hooks share one <form> — each submit button sets its
// own `formAction`, and since both read from the same form, a single
// `comment` field reaches whichever action actually ran. Needed because
// useActionState only binds one action per hook, but this form has two
// distinct actions (approve/reject) that must share one comment input.
export function ApprovalDecisionForm({
  approveAction,
  rejectAction,
}: {
  approveAction: (prevState: FormActionState, formData: FormData) => Promise<FormActionState>;
  rejectAction: (prevState: FormActionState, formData: FormData) => Promise<FormActionState>;
}) {
  const [approveState, approveFormAction, approvePending] = useActionState(approveAction, null);
  const [rejectState, rejectFormAction, rejectPending] = useActionState(rejectAction, null);
  const error = approveState?.error ?? rejectState?.error;
  const pending = approvePending || rejectPending;

  return (
    <form className="flex flex-col gap-2">
      <textarea
        name="comment"
        rows={2}
        placeholder="Optional comment…"
        className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg"
      />
      {error && <p className="text-[13px] text-red">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button formAction={rejectFormAction} disabled={pending} variant="danger" size="sm">
          {rejectPending ? "Rejecting…" : "Reject"}
        </Button>
        <Button formAction={approveFormAction} disabled={pending} variant="primary" size="sm">
          {approvePending ? "Approving…" : "Approve"}
        </Button>
      </div>
    </form>
  );
}
