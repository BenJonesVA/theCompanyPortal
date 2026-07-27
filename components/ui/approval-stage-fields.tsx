"use client";

import { useState } from "react";
import { ApprovalStageMode, ApproverSourceType, Role } from "@prisma/client";
import { STAGE_MODE_LABELS, APPROVER_SOURCE_LABELS } from "@/lib/approvals";
import { ROLE_LABELS } from "@/lib/permissions";

const inputClass = "mt-1 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-fg";

const ROLE_OPTIONS: Role[] = [Role.SUPER_ADMIN, Role.LOCATION_ADMIN, Role.DEPARTMENT_MANAGER, Role.EMPLOYEE];

export type ApprovalStageFieldsInitial = {
  mode: ApprovalStageMode;
  requiredApprovals: number | null;
  approverSourceType: ApproverSourceType;
  approverUserId: string | null;
  approverPermissionGroupId: string | null;
  approverRole: Role | null;
  managerLevelsUp: number | null;
};

// Renders the mode/approver-source selects plus whichever fields that
// combination needs, all inside the surrounding Server Action <form> — same
// "local state only swaps which fields render, values still submit as
// normal named fields" shape as AssetCategoryFields.
export function ApprovalStageFields({
  users,
  permissionGroups,
  initial,
}: {
  users: { id: string; name: string }[];
  permissionGroups: { id: string; name: string }[];
  initial: ApprovalStageFieldsInitial;
}) {
  const [mode, setMode] = useState<ApprovalStageMode>(initial.mode);
  const [sourceType, setSourceType] = useState<ApproverSourceType>(initial.approverSourceType);

  return (
    <>
      <div>
        <label className="block text-sm font-medium text-fg-muted">Approval mode</label>
        <select
          name="mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as ApprovalStageMode)}
          className={inputClass}
        >
          {Object.entries(STAGE_MODE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {mode === ApprovalStageMode.N_OF_M && (
        <div>
          <label className="block text-sm font-medium text-fg-muted">Required approvals</label>
          <input
            type="number"
            name="requiredApprovals"
            min={1}
            step={1}
            defaultValue={initial.requiredApprovals ?? 1}
            className={inputClass}
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-fg-muted">Approver source</label>
        <select
          name="approverSourceType"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as ApproverSourceType)}
          className={inputClass}
        >
          {Object.entries(APPROVER_SOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {sourceType === ApproverSourceType.SPECIFIC_USER && (
        <div>
          <label className="block text-sm font-medium text-fg-muted">Person</label>
          <select name="approverUserId" defaultValue={initial.approverUserId ?? ""} className={inputClass}>
            <option value="">Choose a person…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {sourceType === ApproverSourceType.PERMISSION_GROUP && (
        <div>
          <label className="block text-sm font-medium text-fg-muted">Permission group</label>
          <select name="approverPermissionGroupId" defaultValue={initial.approverPermissionGroupId ?? ""} className={inputClass}>
            <option value="">Choose a group…</option>
            {permissionGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {sourceType === ApproverSourceType.ROLE && (
        <div>
          <label className="block text-sm font-medium text-fg-muted">Role</label>
          <select name="approverRole" defaultValue={initial.approverRole ?? ""} className={inputClass}>
            <option value="">Choose a role…</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>
      )}

      {sourceType === ApproverSourceType.REQUESTER_MANAGER && (
        <div>
          <label className="block text-sm font-medium text-fg-muted">Manager levels up</label>
          <input
            type="number"
            name="managerLevelsUp"
            min={1}
            step={1}
            defaultValue={initial.managerLevelsUp ?? 1}
            className={inputClass}
          />
          <p className="mt-1 text-[11.5px] text-fg-subtle">1 = direct manager, 2 = manager's manager, …</p>
        </div>
      )}

      {sourceType === ApproverSourceType.DEPARTMENT_MANAGER && (
        <p className="text-[12.5px] text-fg-subtle">Resolves to the requester's Department.manager at submission time.</p>
      )}
      {sourceType === ApproverSourceType.LOCATION_ADMIN && (
        <p className="text-[12.5px] text-fg-subtle">
          Resolves to a LOCATION_ADMIN-role user scoped to the requester's Location via LocationMember.
        </p>
      )}
    </>
  );
}
