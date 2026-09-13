"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";
import {
  GROUPS_MAX,
  type SchemeType,
  type SetSchemeAuthoringInput,
} from "@/domain/schemes/setScheme";
import { DEFAULT_HYPERTROPHY_TARGET_RIR } from "@/domain/schemes/rirBand";
import { STRATEGY_DISPLAY_NAMES, type StrategyId } from "@/domain/progression/registry";
import { MAX_BASELINE_LOAD_KG } from "@/domain/prescriptions/schema";
import { dimensionsOf } from "@/domain/measurement/profile";
import { decimalPlaceCount, parseDecimalInput, sanitizeDecimalDraft } from "@/ui/decimalInput";
import type { ExerciseDto } from "@/ui/exercises/types";
import { schemeTypesForProfile, strategyIdsForProfile } from "./formOptions";
import type { PrescriptionDto } from "./types";

type Status = "loading" | "ready" | "submitting" | "not_found";

// setScheme.ts's `distanceRoundsSchemeSchema` / `durationRoundsSchemeSchema`
// ceilings — column ceilings (`numeric(*, 2)`), not meaningful training
// values, same convention as `MAX_BASELINE_LOAD_KG` above.
const MAX_SCHEME_DISTANCE_M = 99999.99;
const MAX_SCHEME_DURATION_S = 86400;

const SCHEME_TYPE_LABELS: Record<SchemeType, string> = {
  fixed: "Fixed sets × reps",
  repRange: "Rep range",
  distanceRounds: "Distance rounds",
  durationRounds: "Duration rounds",
  groups: "Set groups (top set / back-offs)",
};

// set-groups-architecture-evaluation.md §11.1/§4.2 — one draft per authored
// group. `key` is present only for a group retained from the loaded
// prescription (echoed back unchanged); a brand-new group omits it and the
// server assigns one on save (never re-derived, §4.2).
//
// §5.3 — `strategyOverride` is `""` for "same as exercise" (the slot's own
// strategy/config apply, no `progression.groups[key]` entry sent at all) or
// an explicit StrategyId; `repCap` is this group's own rep-progression cap,
// meaningful (and required) only when the group's EFFECTIVE strategy is
// rep-progression and the group is fixed-rep (reps.min === reps.max) — a
// slot-level repCap is forbidden on a `groups` scheme
// (checkPrescriptionCompatibility), so this control is the only way to
// author that configuration at all.
// Stage B (set-groups-architecture-evaluation.md §6/§11.1) — `draftId` is a
// STABLE, client-only identity for this draft (never sent to the server):
// for a retained group it's that group's real key (already stable across
// reorder/rename); for a brand-new group it's a locally-generated token. A
// link references the TARGET draft's `draftId`, never a raw array index —
// `moveGroup`'s array-swap must never silently repoint a link at whatever
// group now occupies the old index (see `sanitizeGroupLinks` below).
export interface GroupDraft {
  draftId: string;
  key?: string;
  label: string;
  setsMin: string;
  setsMax: string;
  repsMin: string;
  repsMax: string;
  rirEnabled: boolean;
  rirMin: string;
  rirMax: string;
  baselineLoadKg: string;
  strategyOverride: "" | StrategyId;
  repCap: string;
  // §6/§19 D-4/D-5 — a linked group's load comes from an earlier, itself-
  // unlinked group; `linkRefDraftId` names that group's `draftId`. Forces
  // `strategyOverride` to `"manual"` whenever enabled (L-1).
  linkEnabled: boolean;
  linkRefDraftId: string;
  linkPercent: string;
}

// Exported (with `sanitizeGroupLinks` below) so unit tests can exercise the
// link-invalidation rules directly — set-groups-stage-b-review.md F-8: the
// only prior coverage was one E2E test driving an actual `↑` reorder;
// `removeGroup`/"reference becomes linked" were untested at every level.
export function randomDraftId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyGroupDraft(label: string): GroupDraft {
  return {
    draftId: randomDraftId(),
    label,
    setsMin: "1",
    setsMax: "1",
    repsMin: "5",
    repsMax: "5",
    rirEnabled: false,
    rirMin: String(DEFAULT_HYPERTROPHY_TARGET_RIR.min),
    rirMax: String(DEFAULT_HYPERTROPHY_TARGET_RIR.max),
    baselineLoadKg: "",
    strategyOverride: "",
    repCap: "",
    linkEnabled: false,
    linkRefDraftId: "",
    linkPercent: "",
  };
}

// Stage B — explicit handling for a link invalidated by an edit (the
// reference group removed, reordered to no longer be earlier, or itself
// turned into a linked group): CLEAR it and report which group's link was
// cleared, never silently repoint it at a different group. Run after every
// mutation (`addGroup`/`removeGroup`/`moveGroup`/toggling any group's own
// `linkEnabled`) so a change to group B that invalidates group A's link to
// it is caught immediately, not only at submit time.
export function sanitizeGroupLinks(groups: GroupDraft[]): {
  groups: GroupDraft[];
  cleared: string[];
} {
  const cleared: string[] = [];
  const next = groups.map((g, i) => {
    // A freshly-checked link with no reference chosen YET is a normal,
    // incomplete-but-not-invalid mid-edit state (the athlete just ticked the
    // box and hasn't opened the dropdown yet) — never clear it here; the
    // required `<select>` and submit-time validation handle "still empty".
    // Only an ALREADY-CHOSEN reference that some OTHER edit invalidated is
    // this function's job.
    if (!g.linkEnabled || g.linkRefDraftId === "") return g;
    const targetIndex = groups.findIndex((other) => other.draftId === g.linkRefDraftId);
    const target = targetIndex >= 0 ? groups[targetIndex] : undefined;
    const valid = target !== undefined && targetIndex < i && !target.linkEnabled;
    if (valid) return g;
    cleared.push(g.label.trim() || `Group ${i + 1}`);
    return {
      ...g,
      linkEnabled: false,
      linkRefDraftId: "",
      linkPercent: "",
      strategyOverride: "" as const,
    };
  });
  return { groups: next, cleared };
}

interface PrescriptionFormProps {
  mode: "create" | "edit";
  templateId?: string;
  prescriptionId?: string;
}

function emptyOr<T>(
  mode: "create" | "edit",
  raw: string,
  parse: (v: string) => T,
): T | undefined | null {
  if (raw.trim() === "") return mode === "create" ? undefined : null;
  return parse(raw);
}

export function PrescriptionForm({ mode, templateId, prescriptionId }: PrescriptionFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(mode === "edit" ? "loading" : "ready");
  const [resolvedTemplateId, setResolvedTemplateId] = useState<string | undefined>(templateId);
  const [exercises, setExercises] = useState<ExerciseDto[]>([]);
  const [exerciseId, setExerciseId] = useState("");
  const [schemeType, setSchemeType] = useState<SchemeType>("fixed");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [minReps, setMinReps] = useState("8");
  const [maxReps, setMaxReps] = useState("12");
  // Athletic Measurement Profiles Release 2 (A-11b, §15.2) — the
  // `distanceRounds` / `durationRounds` per-round targets, unlocked
  // alongside `fixed`/`repRange` above. Text + `inputMode="decimal"` through
  // `sanitizeDecimalDraft`/`parseDecimalInput`, same guard convention as
  // `baselineLoadKg` below (§15.2).
  const [schemeDistanceM, setSchemeDistanceM] = useState("");
  const [schemeDurationS, setSchemeDurationS] = useState("");
  const [groups, setGroups] = useState<GroupDraft[]>([
    emptyGroupDraft("Top"),
    emptyGroupDraft("Back-off"),
  ]);
  const [rirEnabled, setRirEnabled] = useState(false);
  const [rirMin, setRirMin] = useState(String(DEFAULT_HYPERTROPHY_TARGET_RIR.min));
  const [rirMax, setRirMax] = useState(String(DEFAULT_HYPERTROPHY_TARGET_RIR.max));
  const [baselineLoadKg, setBaselineLoadKg] = useState("");
  const [restSeconds, setRestSeconds] = useState("");
  const [strategyId, setStrategyId] = useState<StrategyId>("load-progression");
  const [repCap, setRepCap] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Stage B — set whenever `sanitizeGroupLinks` had to clear a link because
  // an edit invalidated it (reference removed, reordered past it, or itself
  // turned into a linked group): "never silently retarget" means the user
  // sees exactly what was cleared and why.
  const [linkNotice, setLinkNotice] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/exercises?includeArchived=${mode === "edit"}`)
      .then((res) => res.json())
      .then((data: { exercises: ExerciseDto[] }) => setExercises(data.exercises))
      .catch(() => undefined);
  }, [mode]);

  useEffect(() => {
    if (mode !== "edit" || !prescriptionId) return;
    let cancelled = false;
    fetch(`/api/prescriptions/${prescriptionId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setStatus("not_found");
          return;
        }
        const data: { prescription: PrescriptionDto } = await res.json();
        if (cancelled) return;
        const p = data.prescription;
        setResolvedTemplateId(p.templateId);
        setExerciseId(p.exerciseId);
        setSchemeType(p.scheme.scheme.type);
        // Release 2 (A-11b): the editor now writes all four scheme types,
        // gated per exercise profile by `schemeTypesForProfile` below —
        // populate whichever this prescription actually holds.
        if (p.scheme.scheme.type === "fixed") {
          setSets(String(p.scheme.scheme.sets));
          setReps(String(p.scheme.scheme.reps));
        } else if (p.scheme.scheme.type === "repRange") {
          setSets(String(p.scheme.scheme.sets));
          setMinReps(String(p.scheme.scheme.minReps));
          setMaxReps(String(p.scheme.scheme.maxReps));
        } else if (p.scheme.scheme.type === "distanceRounds") {
          setSets(String(p.scheme.scheme.sets));
          setSchemeDistanceM(String(p.scheme.scheme.distanceM));
        } else if (p.scheme.scheme.type === "durationRounds") {
          setSets(String(p.scheme.scheme.sets));
          setSchemeDurationS(String(p.scheme.scheme.durationS));
        } else if (p.scheme.scheme.type === "groups") {
          // §5.3 — `p.progression.groups` (registry.ts's
          // `resolvePrescriptionProgression`) always carries one RESOLVED
          // entry per group, whether or not the athlete ever explicitly
          // overrode it (a group with no override still resolves to the
          // slot's own strategy/config). A resolved strategyId equal to the
          // slot's own raw strategyId is treated as "no override" ("Same as
          // exercise" in the select); any other value, or a tuned repCap, is
          // reflected back into the group's own draft fields, so an existing
          // override survives round-tripping through this form unchanged.
          setGroups(
            p.scheme.scheme.groups.map((g) => {
              const resolved = p.progression.groups?.[g.key];
              // Stage B remediation F-3 (set-groups-stage-b-review.md) — a
              // linked group's `strategyOverride` must load as an explicit
              // "manual", never the ambiguous "" ("same as exercise"), even
              // when the slot's OWN strategy already happens to be manual
              // (the case that produced "" before this fix). Leaving it at
              // "" let a later, unrelated change to the SLOT strategy drag a
              // linked group's effective strategy along with it — see the
              // submit-time fix below, which no longer trusts this value
              // for a linked group either, but starting from a correct,
              // unambiguous state removes the root confusion entirely.
              const strategyOverride: "" | StrategyId = g.link
                ? "manual"
                : resolved && resolved.strategyId !== p.progression.strategyId
                  ? resolved.strategyId
                  : "";
              const resolvedRepCap = resolved?.config.repCap;
              return {
                draftId: g.key,
                key: g.key,
                label: g.label,
                setsMin: String(g.sets.min),
                setsMax: String(g.sets.max),
                repsMin: String(g.reps.min),
                repsMax: String(g.reps.max),
                rirEnabled: g.targetRir !== undefined,
                rirMin: String(g.targetRir?.min ?? DEFAULT_HYPERTROPHY_TARGET_RIR.min),
                rirMax: String(g.targetRir?.max ?? DEFAULT_HYPERTROPHY_TARGET_RIR.max),
                baselineLoadKg: g.baselineLoadKg !== undefined ? String(g.baselineLoadKg) : "",
                strategyOverride,
                repCap: typeof resolvedRepCap === "number" ? String(resolvedRepCap) : "",
                // Stage B — `g.link.ref` is always a real key on a stored
                // scheme, which is exactly the `draftId` a retained group
                // uses (above), so this round-trips with no extra mapping.
                linkEnabled: g.link !== undefined,
                linkRefDraftId: g.link?.ref ?? "",
                linkPercent: g.link ? String(g.link.percent) : "",
              };
            }),
          );
        }
        if (p.targetRir) {
          setRirEnabled(true);
          setRirMin(String(p.targetRir.min));
          setRirMax(String(p.targetRir.max));
        }
        setBaselineLoadKg(p.baselineLoadKg === null ? "" : String(p.baselineLoadKg));
        setRestSeconds(p.restSeconds === null ? "" : String(p.restSeconds));
        setStrategyId(p.progression.strategyId);
        if (typeof p.progression.config.repCap === "number") {
          setRepCap(String(p.progression.config.repCap));
        }
        setNotes(p.notes ?? "");
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load prescription.");
      });
    return () => {
      cancelled = true;
    };
  }, [mode, prescriptionId]);

  // A-11b — every offered option, in both selects, is derived from the
  // target exercise's profile through the same tables the server-side gate
  // checks (`schemeTypesForProfile`/`strategyIdsForProfile`, reusing
  // `profileSupportsScheme`/`strategySupportsProfile`). A profile with no
  // exercise selected yet, or whose exercise hasn't loaded into `exercises`
  // yet, defaults to `load_reps` — the widest, most permissive set, so nothing
  // is ever hidden that a real selection wouldn't need. Derived rather than
  // stored so a mid-edit exercise switch can never leave `schemeType`/
  // `strategyId` pointing at a now-incompatible option: `effectiveSchemeType`/
  // `effectiveStrategyId` (not the raw state) drive the select's value, the
  // scheme fields shown, and what `handleSubmit` sends.
  const selectedExercise = exercises.find((ex) => ex.id === exerciseId);
  const profile = selectedExercise?.measurementProfile ?? "load_reps";
  const availableSchemeTypes = schemeTypesForProfile(profile);
  const availableStrategyIds = strategyIdsForProfile(profile);
  // The `as` casts document a guarantee `schemeTypesForProfile`/
  // `strategyIdsForProfile` already hold (every profile supports at least
  // one scheme type, §9.2, and `manual` supports every profile) — the same
  // "guaranteed non-empty" convention `domain/measurement/format.ts` uses
  // for its own array access under `noUncheckedIndexedAccess`.
  const effectiveSchemeType: SchemeType = availableSchemeTypes.includes(schemeType)
    ? schemeType
    : (availableSchemeTypes[0] as SchemeType);
  const effectiveStrategyId: StrategyId = availableStrategyIds.includes(strategyId)
    ? strategyId
    : (availableStrategyIds[0] as StrategyId);

  // §9.3 — the RIR-band checkbox and baseline load are hidden where the
  // profile has no such field, reusing `dimensionsOf` (the same table
  // `checkPrescriptionCompatibility`'s server-side gate reads) rather than a
  // second UI-side rule.
  const dims = dimensionsOf(profile);
  const rirSupported = dims.rir !== "forbidden";
  const baselineLoadSupported = dims.weight !== "forbidden";

  const needsRepCap = effectiveStrategyId === "rep-progression" && effectiveSchemeType === "fixed";

  // Stage B — every group-list mutation runs through `sanitizeGroupLinks`
  // immediately (not only at submit time), so an edit that invalidates
  // another group's link is caught and surfaced right away.
  //
  // Stage B remediation V-2 (set-groups-stage-b-remediation-verification.md
  // §7) — this used to call `setLinkNotice(cleared.length > 0 ? … : null)`
  // UNCONDITIONALLY, so any later mutation that itself cleared nothing (an
  // edit to an unrelated field, on an unrelated group) reset the notice to
  // `null` — erasing F-6's warning after a single keystroke, defeating the
  // exact flow it exists to protect ("clear a link, then keep editing"). The
  // explicit lifecycle is now: set (and, if a notice is already showing,
  // OVERWRITE it with the fresh, accurate list — never merge or append stale
  // group names into a new invalidation), never implicitly cleared by an
  // unrelated mutation; only a later invalidation, an explicit dismissal (the
  // "Dismiss" control below), or a successful save (`handleSubmit`) resets it.
  function updateGroups(updater: (prev: GroupDraft[]) => GroupDraft[]) {
    setGroups((prev) => {
      const { groups: next, cleared } = sanitizeGroupLinks(updater(prev));
      if (cleared.length > 0) {
        // Stage B remediation F-6 (set-groups-stage-b-review.md) — clearing
        // a link also resets `strategyOverride` to "" ("same as exercise"),
        // which is a real, visible consequence (the group now inherits
        // whatever the slot's own strategy is, not manual) — say so, not
        // only that the link was cleared.
        setLinkNotice(
          `Link cleared for ${cleared.join(", ")}: the reference group is no longer valid (removed, reordered, or itself now linked). Progression strategy reset to "Same as exercise" for the affected group(s) — review before saving.`,
        );
      }
      return next;
    });
  }
  function addGroup() {
    updateGroups((prev) => [...prev, emptyGroupDraft(`Group ${prev.length + 1}`)]);
  }
  function removeGroup(index: number) {
    updateGroups((prev) => prev.filter((_, i) => i !== index));
  }
  function moveGroup(index: number, direction: -1 | 1) {
    updateGroups((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }
  function patchGroup(index: number, patch: Partial<GroupDraft>) {
    updateGroups((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }
  // Stage B — enabling a link forces `strategyOverride` to "manual" (L-1) and
  // clears any tuned repCap (meaningless once manual); disabling one resets
  // the override back to "same as exercise" rather than leaving a stale
  // forced "manual" behind.
  function setGroupLinkEnabled(index: number, enabled: boolean) {
    updateGroups((prev) =>
      prev.map((g, i) =>
        i === index
          ? {
              ...g,
              linkEnabled: enabled,
              linkRefDraftId: enabled ? g.linkRefDraftId : "",
              linkPercent: enabled ? g.linkPercent : "",
              strategyOverride: enabled ? "manual" : "",
              repCap: "",
            }
          : g,
      ),
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    let scheme: SetSchemeAuthoringInput;
    if (effectiveSchemeType === "fixed") {
      scheme = { type: "fixed", sets: Number(sets), reps: Number(reps) };
    } else if (effectiveSchemeType === "repRange") {
      scheme = {
        type: "repRange",
        sets: Number(sets),
        minReps: Number(minReps),
        maxReps: Number(maxReps),
      };
    } else if (effectiveSchemeType === "distanceRounds") {
      const parsed = parseDecimalInput(schemeDistanceM);
      if (
        parsed === null ||
        parsed <= 0 ||
        parsed > MAX_SCHEME_DISTANCE_M ||
        decimalPlaceCount(schemeDistanceM) > 2
      ) {
        setError(
          `Enter a valid distance greater than 0, up to ${MAX_SCHEME_DISTANCE_M} m, with at most 2 decimal places.`,
        );
        return;
      }
      scheme = { type: "distanceRounds", sets: Number(sets), distanceM: parsed };
    } else if (effectiveSchemeType === "durationRounds") {
      const parsed = parseDecimalInput(schemeDurationS);
      if (
        parsed === null ||
        parsed <= 0 ||
        parsed > MAX_SCHEME_DURATION_S ||
        decimalPlaceCount(schemeDurationS) > 2
      ) {
        setError(
          `Enter a valid duration greater than 0, up to ${MAX_SCHEME_DURATION_S} s, with at most 2 decimal places.`,
        );
        return;
      }
      scheme = { type: "durationRounds", sets: Number(sets), durationS: parsed };
    } else {
      if (groups.length === 0) {
        setError("Add at least one group.");
        return;
      }
      // Stage B — validated here rather than relying solely on the number
      // input's min/max/required attributes (a defence-in-depth match for
      // every other numeric field's own validated-then-parsed pattern in
      // this handler, e.g. baselineLoadKg below).
      for (const g of groups) {
        if (!g.linkEnabled) continue;
        if (g.linkRefDraftId.trim() === "") {
          setError(`Select a reference group for "${g.label.trim() || "a group"}"'s link.`);
          return;
        }
        const percent = Number(g.linkPercent);
        if (!Number.isInteger(percent) || percent < 10 || percent > 100) {
          setError(`Enter a whole percentage between 10 and 100 for "${g.label.trim()}"'s link.`);
          return;
        }
      }
      scheme = {
        type: "groups",
        groups: groups.map((g) => {
          const linkTargetIndex = groups.findIndex((t) => t.draftId === g.linkRefDraftId);
          const linkTarget = linkTargetIndex >= 0 ? groups[linkTargetIndex] : undefined;
          return {
            ...(g.key ? { key: g.key } : {}),
            label: g.label.trim(),
            sets: { min: Number(g.setsMin), max: Number(g.setsMax) },
            reps: { min: Number(g.repsMin), max: Number(g.repsMax) },
            ...(g.rirEnabled
              ? { targetRir: { min: Number(g.rirMin), max: Number(g.rirMax) } }
              : {}),
            ...(g.baselineLoadKg.trim() !== "" ? { baselineLoadKg: Number(g.baselineLoadKg) } : {}),
            // Stage B — a retained target (already has a real `key`) is
            // addressed by that key; a brand-new target created in this same
            // save is addressed by its own array index, resolved server-side
            // by `assignGroupKeys` once every group has a final key (index
            // === draft array index === submitted `groups` array index, so
            // `linkTargetIndex` is exactly the index the server will see).
            ...(g.linkEnabled && linkTarget
              ? linkTarget.key
                ? { link: { ref: linkTarget.key, percent: Number(g.linkPercent) } }
                : { link: { refIndex: linkTargetIndex, percent: Number(g.linkPercent) } }
              : {}),
          };
        }),
      };
    }

    const config: Record<string, unknown> = {};
    if (needsRepCap && repCap.trim() !== "") config.repCap = Number(repCap);

    // §5.3/M-3 — one override entry per group that either chose an explicit
    // strategy (`strategyOverride !== ""`) or tuned a repCap; a group left
    // entirely at "Same as exercise" with no repCap sends no entry at all
    // (progression.groups omits it, and resolvePrescriptionProgression
    // simply defaults it from the slot, exactly as before this control
    // existed). A group that already has a server-assigned key is addressed
    // by that key (`groups`, survives a reorder); a brand-new group (no key
    // yet — §4.2, the server assigns it on THIS save) is addressed by its
    // own POSITIONAL INDEX in this submission (`groupOverridesByIndex`),
    // which the service layer resolves onto the key that position is
    // assigned, once, before it ever reaches `resolvePrescriptionProgression`
    // — this is what makes a fixed-rep group's required repCap authorable on
    // the SAME save that creates it, closing M-3's dead end. Validated
    // client-side by the repCap input's own `required` attribute below, so
    // an invalid submission can't reach the server missing a repCap a
    // fixed-rep rep-progression group needs.
    let groupsProgressionOverride:
      Record<string, { strategyId: StrategyId; config?: Record<string, unknown> }> | undefined;
    let groupOverridesByIndex:
      Record<string, { strategyId: StrategyId; config?: Record<string, unknown> }> | undefined;
    if (effectiveSchemeType === "groups") {
      groupsProgressionOverride = {};
      groupOverridesByIndex = {};
      groups.forEach((g, index) => {
        // Stage B remediation F-3 (set-groups-stage-b-review.md) — a linked
        // group's effective strategy is ALWAYS "manual" (L-1), never
        // `g.strategyOverride || effectiveStrategyId`. That fallback let a
        // linked group whose `strategyOverride` was still "" (legitimately,
        // when the slot's own strategy happened to be manual at load time)
        // silently inherit whatever the SLOT strategy was changed to
        // afterwards, with no control the user could use to fix it (the
        // strategy select is replaced entirely by a static note while
        // linked). An override is therefore always emitted for a linked
        // group — never left to the "same as exercise" omission below —
        // with no untick/re-tick needed to reach a correct payload.
        const effectiveGroupStrategyId = g.linkEnabled
          ? "manual"
          : g.strategyOverride || effectiveStrategyId;
        const groupNeedsRepCap =
          effectiveGroupStrategyId === "rep-progression" && g.repsMin === g.repsMax;
        if (
          !g.linkEnabled &&
          g.strategyOverride === "" &&
          !(groupNeedsRepCap && g.repCap.trim() !== "")
        ) {
          return;
        }
        const groupConfig: Record<string, unknown> = {};
        if (groupNeedsRepCap && g.repCap.trim() !== "") groupConfig.repCap = Number(g.repCap);
        const override = {
          strategyId: effectiveGroupStrategyId,
          ...(Object.keys(groupConfig).length > 0 ? { config: groupConfig } : {}),
        };
        if (g.key) groupsProgressionOverride![g.key] = override;
        else groupOverridesByIndex![String(index)] = override;
      });
    }

    // L-4 remediation — a comma-typed baseline must never silently clear an
    // existing one on edit; empty still means "no baseline" (unchanged).
    // §9.3 (item 2, Release 2) — when the profile has no weight field the
    // control is hidden entirely (`baselineLoadSupported` below), so the
    // text state is never read; same "unspecified" vs "explicitly cleared"
    // shape as before.
    let baselineLoadKgValue: number | null | undefined;
    if (!baselineLoadSupported) {
      baselineLoadKgValue = mode === "create" ? undefined : null;
    } else if (baselineLoadKg.trim() === "") {
      baselineLoadKgValue = mode === "create" ? undefined : null;
    } else {
      const parsed = parseDecimalInput(baselineLoadKg);
      // LOW-2 (phase-5.5-light-remediation-verification.md) — a raw
      // more-than-2-decimal draft (e.g. "1,005") is float-noise, not a
      // deliberate 0.25-grid value; the domain schema's `.multipleOf(0.25)`
      // catches it too, but rejecting it here avoids a round trip for the
      // common float-noise case.
      if (
        parsed === null ||
        parsed < 0 ||
        parsed > MAX_BASELINE_LOAD_KG ||
        decimalPlaceCount(baselineLoadKg) > 2
      ) {
        setError(
          `Enter a valid baseline load between 0 and ${MAX_BASELINE_LOAD_KG}, with at most 2 decimal places.`,
        );
        return;
      }
      baselineLoadKgValue = parsed;
    }

    const payload = {
      exerciseId,
      scheme: { v: 1 as const, scheme },
      targetRir:
        rirSupported && rirEnabled
          ? { min: Number(rirMin), max: Number(rirMax) }
          : mode === "create"
            ? undefined
            : null,
      baselineLoadKg: baselineLoadKgValue,
      restSeconds: emptyOr(mode, restSeconds, Number),
      progression: {
        strategyId: effectiveStrategyId,
        config,
        ...(groupsProgressionOverride && Object.keys(groupsProgressionOverride).length > 0
          ? { groups: groupsProgressionOverride }
          : {}),
        ...(groupOverridesByIndex && Object.keys(groupOverridesByIndex).length > 0
          ? { groupOverridesByIndex }
          : {}),
      },
      notes: emptyOr(mode, notes, (v) => v),
    };

    setStatus("submitting");
    try {
      const res = await fetch(
        mode === "create"
          ? `/api/templates/${templateId}/prescriptions`
          : `/api/prescriptions/${prescriptionId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        setLinkNotice(null);
        router.push(`/templates/${mode === "create" ? templateId : resolvedTemplateId}`);
        router.refresh();
        return;
      }

      const body = (await res.json().catch(() => null)) as {
        error?: string;
        issues?: string[];
      } | null;
      if (body?.error === "incompatible_prescription") {
        setError(body.issues?.join("; ") ?? "This progression strategy doesn't fit this scheme.");
      } else if (body?.error === "exercise_archived") {
        setError("The selected exercise is archived and can't be prescribed.");
      } else if (body?.error === "exercise_not_found") {
        setError("The selected exercise could not be found.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setStatus("ready");
    } catch {
      setError("Network error. Please try again.");
      setStatus("ready");
    }
  }

  async function handleDelete() {
    if (!prescriptionId) return;
    if (!window.confirm("Remove this exercise from the template?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/prescriptions/${prescriptionId}`, { method: "DELETE" });
      if (res.status === 204) {
        router.push(`/templates/${resolvedTemplateId}`);
        router.refresh();
        return;
      }
      setError("Failed to delete.");
    } finally {
      setDeleting(false);
    }
  }

  if (status === "loading") {
    return <p className="text-center text-sm text-slate-400">Loading…</p>;
  }

  if (status === "not_found") {
    return <p className="text-center text-sm text-slate-400">Prescription not found.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-50">
        {mode === "create" ? "Add exercise" : "Edit prescription"}
      </h1>

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Exercise
        <select
          required
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          <option value="" disabled>
            Select an exercise…
          </option>
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}
              {ex.archivedAt ? " (archived)" : ""}
            </option>
          ))}
        </select>
      </label>

      {/*
        A-11b (Release 2) — options are the exercise's own compatible set
        (`availableSchemeTypes`, derived above from `schemeTypesForProfile`),
        never a fixed two-entry list. For `load_reps`/`reps` this renders
        exactly as before (`Fixed sets × reps` / `Rep range`); a
        `load_distance`/`distance_time` exercise offers only `distanceRounds`
        ("Distance rounds"), a `duration`/`load_duration` exercise only
        `durationRounds` ("Duration rounds") — never both, and never
        `fixed`/`repRange`, matching §9.2.
      */}
      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Scheme
        <select
          value={effectiveSchemeType}
          onChange={(e) => setSchemeType(e.target.value as SchemeType)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          {availableSchemeTypes.map((t) => (
            <option key={t} value={t}>
              {SCHEME_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        {effectiveSchemeType !== "groups" && (
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
            Sets
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              required
              value={sets}
              onChange={(e) => setSets(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
        )}
        {effectiveSchemeType === "fixed" && (
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
            Reps
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              required
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
        )}
        {effectiveSchemeType === "repRange" && (
          <>
            <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
              Min reps
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                required
                value={minReps}
                onChange={(e) => setMinReps(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
              Max reps
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                required
                value={maxReps}
                onChange={(e) => setMaxReps(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
              />
            </label>
          </>
        )}
        {effectiveSchemeType === "distanceRounds" && (
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
            Distance per round (m)
            <input
              type="text"
              inputMode="decimal"
              required
              value={schemeDistanceM}
              onChange={(e) => setSchemeDistanceM(sanitizeDecimalDraft(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
        )}
        {effectiveSchemeType === "durationRounds" && (
          <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
            Duration per round (s)
            <input
              type="text"
              inputMode="decimal"
              required
              value={schemeDurationS}
              onChange={(e) => setSchemeDurationS(sanitizeDecimalDraft(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
            />
          </label>
        )}
      </div>

      {/* set-groups-architecture-evaluation.md §11.1 — ordered groups within
          one slot. `key` is preserved across an edit (retained groups echo
          it back, see the load effect above); a brand-new group is sent
          without one and the server assigns it (§4.2, never re-derived). Each
          group may also override the slot's progression strategy/repCap
          (§5.3/M-3, below) on the SAME save that creates it — a group left
          at "Same as exercise" runs the slot's own strategy/config
          verbatim. */}
      {effectiveSchemeType === "groups" && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-800 p-3">
          {groups.map((g, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-lg border border-slate-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <input
                  aria-label={`Group ${index + 1} label`}
                  type="text"
                  required
                  maxLength={24}
                  value={g.label}
                  onChange={(e) => patchGroup(index, { label: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => moveGroup(index, -1)}
                    disabled={index === 0}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveGroup(index, 1)}
                    disabled={index === groups.length - 1}
                    className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeGroup(index)}
                    disabled={groups.length <= 1}
                    className="rounded border border-red-900 px-2 py-1 text-xs text-red-400 disabled:opacity-30"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
                  Sets min
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={20}
                    required
                    value={g.setsMin}
                    onChange={(e) => patchGroup(index, { setsMin: e.target.value })}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
                  Sets max
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={20}
                    required
                    value={g.setsMax}
                    onChange={(e) => patchGroup(index, { setsMax: e.target.value })}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
                  Reps min
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    required
                    value={g.repsMin}
                    onChange={(e) => patchGroup(index, { repsMin: e.target.value })}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
                  Reps max
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                    required
                    value={g.repsMax}
                    onChange={(e) => patchGroup(index, { repsMax: e.target.value })}
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={g.rirEnabled}
                  onChange={(e) => patchGroup(index, { rirEnabled: e.target.checked })}
                />
                Override target RIR band for this group
              </label>
              {g.rirEnabled && (
                <div className="flex gap-2">
                  <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
                    Min RIR
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10}
                      value={g.rirMin}
                      onChange={(e) => patchGroup(index, { rirMin: e.target.value })}
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
                    Max RIR
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10}
                      value={g.rirMax}
                      onChange={(e) => patchGroup(index, { rirMax: e.target.value })}
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                    />
                  </label>
                </div>
              )}
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                Baseline load for this group (kg, optional)
                <input
                  type="text"
                  inputMode="decimal"
                  value={g.baselineLoadKg}
                  onChange={(e) =>
                    patchGroup(index, { baselineLoadKg: sanitizeDecimalDraft(e.target.value) })
                  }
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                />
              </label>
              {/* set-groups-architecture-evaluation.md §6/§19 D-4/D-5 — a
                  linked group's load is a percentage of an earlier, itself-
                  unlinked group of this same scheme; only such candidates are
                  offered (no self, no forward reference, no chains — the
                  domain schema enforces this too, but the editor should never
                  offer an option it would then reject). Unavailable for the
                  first group: there is no earlier group to link to. */}
              {index > 0 && (
                <>
                  <label className="flex items-center gap-2 text-xs text-slate-400">
                    <input
                      type="checkbox"
                      checked={g.linkEnabled}
                      onChange={(e) => setGroupLinkEnabled(index, e.target.checked)}
                    />
                    Link this group&rsquo;s load to an earlier group&rsquo;s top set (percentage)
                  </label>
                  {g.linkEnabled && (
                    <div className="flex gap-2">
                      <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
                        Reference group
                        <select
                          required
                          value={g.linkRefDraftId}
                          onChange={(e) => patchGroup(index, { linkRefDraftId: e.target.value })}
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                        >
                          <option value="" disabled>
                            Select a group…
                          </option>
                          {groups.slice(0, index).map((candidate, candidateIndex) => (
                            <option
                              key={candidate.draftId}
                              value={candidate.draftId}
                              disabled={candidate.linkEnabled}
                            >
                              {candidate.label.trim() || `Group ${candidateIndex + 1}`}
                              {candidate.linkEnabled ? " (itself linked — unavailable)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
                        Percent of reference top set
                        <input
                          type="number"
                          inputMode="numeric"
                          min={10}
                          max={100}
                          step={1}
                          required
                          value={g.linkPercent}
                          onChange={(e) => patchGroup(index, { linkPercent: e.target.value })}
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                        />
                      </label>
                    </div>
                  )}
                </>
              )}
              {/* set-groups-architecture-evaluation.md §5.3/M-3 — per-group
                  progression override, authorable on the SAME save that
                  creates the group: a group with no key yet is addressed by
                  its own array index (`groupOverridesByIndex`, resolved by
                  the service layer onto the key this position is assigned —
                  see the submit handler above), never gated behind a
                  follow-up edit. §6.3 rule L-1 — a linked group's load
                  authority is the link itself, so its progression strategy is
                  forced to Manual and this control is replaced with a fixed
                  note (never offering an incompatible pairing the server
                  would reject anyway). */}
              {g.linkEnabled ? (
                <p className="text-xs text-slate-500">
                  Manual progression (required for a percentage-linked group).
                </p>
              ) : (
                (() => {
                  const effectiveGroupStrategyId: StrategyId =
                    g.strategyOverride || effectiveStrategyId;
                  const groupNeedsRepCap =
                    effectiveGroupStrategyId === "rep-progression" && g.repsMin === g.repsMax;
                  return (
                    <>
                      <label className="flex flex-col gap-1 text-xs text-slate-400">
                        Progression strategy for this group
                        <select
                          value={g.strategyOverride}
                          onChange={(e) =>
                            patchGroup(index, {
                              strategyOverride: e.target.value as "" | StrategyId,
                            })
                          }
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                        >
                          <option value="">
                            Same as exercise ({STRATEGY_DISPLAY_NAMES[effectiveStrategyId]})
                          </option>
                          {availableStrategyIds.map((id) => (
                            <option key={id} value={id}>
                              {STRATEGY_DISPLAY_NAMES[id]}
                            </option>
                          ))}
                        </select>
                      </label>
                      {groupNeedsRepCap && (
                        <label className="flex flex-col gap-1 text-xs text-slate-400">
                          Rep cap for this group (required for rep progression on a fixed-rep group)
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            required
                            value={g.repCap}
                            onChange={(e) => patchGroup(index, { repCap: e.target.value })}
                            className="rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-50 outline-none focus:border-slate-400"
                          />
                        </label>
                      )}
                    </>
                  );
                })()
              )}
            </div>
          ))}
          {linkNotice && (
            <p className="text-xs text-amber-400">
              {linkNotice}{" "}
              <button type="button" onClick={() => setLinkNotice(null)} className="underline">
                Dismiss
              </button>
            </p>
          )}
          <button
            type="button"
            onClick={addGroup}
            disabled={groups.length >= GROUPS_MAX}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 disabled:opacity-30"
          >
            + Add group
          </button>
        </div>
      )}

      {/* §9.3 (item 2, Release 2) — hidden where `dimensionsOf(profile).rir`
          is `"forbidden"` (every profile but `load_reps`/`reps`), reusing
          the same table the server-side gate reads. */}
      {rirSupported && (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={rirEnabled}
              onChange={(e) => setRirEnabled(e.target.checked)}
            />
            Set target RIR band
          </label>
          {rirEnabled && (
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
                Min RIR
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10}
                  value={rirMin}
                  onChange={(e) => setRirMin(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm text-slate-300">
                Max RIR
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10}
                  value={rirMax}
                  onChange={(e) => setRirMax(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
                />
              </label>
            </div>
          )}
        </>
      )}

      {/* §9.3 (item 2, Release 2) — hidden where `dimensionsOf(profile).weight`
          is `"forbidden"` (`reps`/`distance_time`/`duration`); shown for
          `load_reps` (unchanged) and now also `load_distance`/`load_duration`. */}
      {baselineLoadSupported && (
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Baseline load (kg, optional)
          <input
            type="text"
            inputMode="decimal"
            value={baselineLoadKg}
            onChange={(e) => setBaselineLoadKg(sanitizeDecimalDraft(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Rest (seconds, optional)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={restSeconds}
          onChange={(e) => setRestSeconds(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      {/*
        A-11b (Release 2) — options are the exercise's compatible strategy
        set (`availableStrategyIds`, derived above from
        `strategyIdsForProfile`). For a `reps` exercise this reduces to
        `["manual"]` (O-11): `load-progression`/`rep-progression` are never
        offered, as a consequence of the same rule the server checks, not a
        `reps`-specific branch here.
      */}
      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Progression strategy
        <select
          value={effectiveStrategyId}
          onChange={(e) => setStrategyId(e.target.value as StrategyId)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        >
          {availableStrategyIds.map((id) => (
            <option key={id} value={id}>
              {STRATEGY_DISPLAY_NAMES[id]}
            </option>
          ))}
        </select>
      </label>

      {needsRepCap && (
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Rep cap (required for rep progression on a fixed scheme)
          <input
            type="number"
            inputMode="numeric"
            min={1}
            required
            value={repCap}
            onChange={(e) => setRepCap(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
          />
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Notes (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Saving…" : mode === "create" ? "Add exercise" : "Save changes"}
      </Button>

      {mode === "edit" && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg border border-red-900 px-4 py-3 text-sm text-red-400 disabled:opacity-50"
        >
          Remove from template
        </button>
      )}
    </form>
  );
}
