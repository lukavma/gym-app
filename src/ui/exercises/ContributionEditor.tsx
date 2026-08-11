"use client";

import { MUSCLE_GROUPS, type MuscleGroupSlug } from "@/domain/exercises/muscleGroups";
import { CONTRIBUTION_ROLES, type ContributionRole } from "@/domain/exercises/schema";

export interface ContributionRow {
  muscleGroupId: MuscleGroupSlug | "";
  role: ContributionRole;
  // Kept as a string for a controlled numeric input; empty means "use the
  // role's default weight" (domain/exercises/schema.ts DEFAULT_CONTRIBUTION_WEIGHT).
  weight: string;
}

export function emptyContributionRow(role: ContributionRole = "primary"): ContributionRow {
  return { muscleGroupId: "", role, weight: "" };
}

interface ContributionEditorProps {
  rows: ContributionRow[];
  onChange: (rows: ContributionRow[]) => void;
}

export function ContributionEditor({ rows, onChange }: ContributionEditorProps) {
  function updateRow(index: number, patch: Partial<ContributionRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function addRow() {
    onChange([...rows, emptyContributionRow("secondary")]);
  }

  const usedSlugs = new Set(rows.map((r) => r.muscleGroupId).filter(Boolean));
  const canAddMore = usedSlugs.size < MUSCLE_GROUPS.length;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm text-slate-300">Muscles worked</span>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-lg border border-slate-700 p-3">
          <div className="flex gap-2">
            <select
              value={row.muscleGroupId}
              onChange={(e) =>
                updateRow(index, { muscleGroupId: e.target.value as MuscleGroupSlug })
              }
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
            >
              <option value="">Select muscle…</option>
              {MUSCLE_GROUPS.map((group) => (
                <option
                  key={group.slug}
                  value={group.slug}
                  disabled={usedSlugs.has(group.slug) && row.muscleGroupId !== group.slug}
                >
                  {group.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeRow(index)}
              aria-label="Remove muscle"
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2">
            <select
              value={row.role}
              onChange={(e) => updateRow(index, { role: e.target.value as ContributionRole })}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
            >
              {CONTRIBUTION_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role === "primary" ? "Primary" : "Secondary"}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              placeholder={row.role === "primary" ? "1.0" : "0.5"}
              value={row.weight}
              onChange={(e) => updateRow(index, { weight: e.target.value })}
              className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
            />
          </div>
        </div>
      ))}

      {canAddMore && (
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-dashed border-slate-600 px-3 py-2 text-sm text-slate-300"
        >
          + Add muscle
        </button>
      )}
    </div>
  );
}
