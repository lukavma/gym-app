"use client";

import {
  LEAF_MUSCLE_GROUP_SLUGS,
  LEAF_MUSCLE_GROUPS,
  MUSCLE_GROUPS,
  isLeafMuscleGroupSlug,
  isRollupMuscleGroupSlug,
  type MuscleGroupDefinition,
  type MuscleGroupSlug,
} from "@/domain/exercises/muscleGroups";
import { CONTRIBUTION_ROLES, type ContributionRole } from "@/domain/exercises/schema";
import { sanitizeDecimalDraft } from "@/ui/decimalInput";
import { contributionMuscleLabel } from "./muscleGroupDisplay";

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

  // Only leaf slugs count toward capacity/disable — a legacy rollup row
  // (e.g. `back`) occupies a slot in `rows` but is never itself selectable
  // for a new row, so it must not shrink the leaf headroom (LOW #10,
  // pre-phase-6-muscle-taxonomy-architecture-review.md: a naive swap to
  // `usedSlugs.size < LEAF_MUSCLE_GROUP_SLUGS.length` would still count the
  // legacy row's own slug in the numerator, hiding "+ Add muscle" one leaf
  // early).
  const usedLeafSlugs = new Set(rows.map((r) => r.muscleGroupId).filter(isLeafMuscleGroupSlug));
  const canAddMore = usedLeafSlugs.size < LEAF_MUSCLE_GROUP_SLUGS.length;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm text-slate-300">Muscles worked</span>
      {rows.map((row, index) => {
        // Every row offers the 17 leaves; a row already holding a legacy
        // rollup value (e.g. `back`) additionally sees that one value as a
        // self-only option, so it stays visible/editable without ever being
        // offered to a different (new or leaf) row.
        const currentRollup = isRollupMuscleGroupSlug(row.muscleGroupId)
          ? MUSCLE_GROUPS.find((group) => group.slug === row.muscleGroupId)
          : undefined;
        const options: readonly MuscleGroupDefinition[] = currentRollup
          ? [currentRollup, ...LEAF_MUSCLE_GROUPS]
          : LEAF_MUSCLE_GROUPS;

        return (
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
                {options.map((group) => (
                  <option
                    key={group.slug}
                    value={group.slug}
                    disabled={
                      isLeafMuscleGroupSlug(group.slug) &&
                      usedLeafSlugs.has(group.slug) &&
                      row.muscleGroupId !== group.slug
                    }
                  >
                    {contributionMuscleLabel(group.slug)}
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
            {currentRollup && (
              <p className="text-xs text-amber-400">
                Unclassified Back — pick Lats or Upper Back, or leave as-is.
              </p>
            )}
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
                type="text"
                inputMode="decimal"
                placeholder={row.role === "primary" ? "1.0" : "0.5"}
                value={row.weight}
                onChange={(e) => updateRow(index, { weight: sanitizeDecimalDraft(e.target.value) })}
                className="w-24 rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
              />
            </div>
          </div>
        );
      })}

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
