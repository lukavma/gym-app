// PI-018 Workout prescription context —
// docs/reviews/workout-prescription-context-architecture-evaluation.md
// §5.1/§5.2/§5.3/§7 C-1, U-6.
//
// The card half of the feature: prescribed rest appended to the existing
// prescription subtitle, and a labelled read-only "Program note:" block that
// must never be confusable with the editable session note below it.
//
// No JSX/`.tsx` here on purpose — `vitest.config.ts` only picks up
// `tests/unit/**/*.test.ts`, and `React.createElement` renders identically
// through `react-dom/server`'s `renderToStaticMarkup`, so this needs no
// test-runner config change. The precedent is
// tests/unit/measurement/uiFormatWiring.test.ts, which already renders
// `ExerciseCard` exactly this way.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { newId } from "@/domain/ids/uuidv7";
import { formatRestSeconds } from "@/domain/measurement/format";
import {
  STRATEGY_VERSIONS,
  wrapPrescriptionSnapshot,
  type PrescriptionSnapshotData,
} from "@/domain/schemas/prescriptionSnapshot";
import { ExerciseCard } from "@/ui/workout/ExerciseCard";
import type { ActiveSessionExerciseDto } from "@/sync/types";

const SCHEME_TEXT = "3 × 5"; // formatScheme({type:"fixed",sets:3,reps:5})

function snapshotData(overrides: Partial<PrescriptionSnapshotData> = {}): PrescriptionSnapshotData {
  return {
    exerciseId: "00000000-0000-0000-0000-000000000001",
    exerciseName: "Bench Press",
    scheme: { type: "fixed", sets: 3, reps: 5 },
    targetRir: { min: 1, max: 2 },
    restSeconds: 150,
    progression: {
      strategyId: "manual",
      strategyVersion: STRATEGY_VERSIONS.manual,
      config: {},
      classification: "user_defined",
    },
    appliedModifiers: null,
    prefill: { loadKg: 100, reps: 5 },
    prescriptionNotes: "Pause 1 s on the chest.",
    ...overrides,
  };
}

function exerciseWith(
  snapshot: PrescriptionSnapshotData | null,
  overrides: Partial<ActiveSessionExerciseDto> = {},
): ActiveSessionExerciseDto {
  return {
    id: newId(),
    exerciseId: newId(),
    exerciseName: "Bench Press",
    position: 0,
    source: "template",
    prescription: snapshot === null ? null : wrapPrescriptionSnapshot(snapshot),
    skipped: false,
    notes: null,
    loadStepKg: 2.5,
    recommendation: null,
    measurement: { profile: "load_reps", loadBasis: "unspecified" },
    sets: [],
    ...overrides,
  };
}

function render(exercise: ActiveSessionExerciseDto): string {
  return renderToStaticMarkup(createElement(ExerciseCard, { exercise, isDeload: false }));
}

// The "no stray separator" assertion is SCOPED to the subtitle element, per
// the architecture review's §5 caution: `·` is also emitted by
// `formatSetLine` and by the duration `m:ss` label, so asserting over the
// whole rendered HTML would be checking something else entirely. The
// subtitle is the one `<p>` carrying the formatted scheme; it contains no
// nested elements, so a non-greedy match up to the first `</p>` is exact.
function subtitle(html: string): string | null {
  const paragraphs = html.match(/<p[^>]*>.*?<\/p>/g) ?? [];
  return paragraphs.find((p) => p.includes(SCHEME_TEXT)) ?? null;
}

describe("U-6 — ExerciseCard renders the slot's frozen prescription context", () => {
  it("(a) renders rest in the existing subtitle and the note as a labelled block", () => {
    const html = render(exerciseWith(snapshotData()));

    const line = subtitle(html);
    expect(line).not.toBeNull();
    // §5.1's exact subtitle shape: scheme, RIR clause, then the rest clause.
    expect(line).toContain(SCHEME_TEXT);
    expect(line).toContain("@ RIR 1-2");
    expect(line).toContain(`· Rest ${formatRestSeconds(150)}`);
    expect(formatRestSeconds(150)).toBe("2:30");

    // §5.2 — the note is its own block with an origin-stating label.
    expect(html).toContain("Program note: ");
    expect(html).toContain("Pause 1 s on the chest.");
    // It is NOT inside the subtitle paragraph.
    expect(line).not.toContain("Program note");
  });

  it("(b) renders neither label nor a stray separator when both values are null", () => {
    const html = render(exerciseWith(snapshotData({ restSeconds: null, prescriptionNotes: null })));

    const line = subtitle(html);
    expect(line).not.toBeNull();
    expect(line).toContain(SCHEME_TEXT);
    // §5.3 — omission, never a placeholder: no trailing `·`, no "Rest",
    // no em dash. Scoped to the subtitle deliberately.
    expect(line).not.toContain("·");
    expect(line).not.toContain("Rest");
    expect(line).not.toContain("—");
    expect(html).not.toContain("Program note");
  });

  it("(c) a LEGACY snapshot with no prescriptionNotes key shows rest but no note (the §7 C-1 asymmetry)", () => {
    // Exactly what a session already in flight across the deploy carries:
    // `restSeconds` has been frozen since Phase 3, `prescriptionNotes` did
    // not exist when this snapshot was written. Built by deletion so the
    // key is genuinely absent, not merely null.
    const legacy = snapshotData();
    delete (legacy as Partial<PrescriptionSnapshotData>).prescriptionNotes;
    expect("prescriptionNotes" in legacy).toBe(false);

    const html = render(exerciseWith(legacy));

    expect(subtitle(html)).toContain("· Rest 2:30");
    expect(html).not.toContain("Program note");
  });

  it("(d) an ad-hoc slot (prescription: null) renders neither", () => {
    const html = render(exerciseWith(null, { source: "adhoc" }));
    expect(html).not.toContain("Program note");
    expect(html).not.toContain("Rest");
    // The card still renders — the ad-hoc marker proves we rendered the
    // right thing rather than an empty string.
    expect(html).toContain("Ad-hoc");
  });

  it("(e) the program note and the editable session note are independent and both visible", () => {
    // `notesOpen` initialises to `Boolean(exercise.notes)`, so a fixture
    // with a session note renders the textarea with no interaction.
    const html = render(
      exerciseWith(snapshotData({ prescriptionNotes: "program text" }), {
        notes: "session text",
      }),
    );

    expect(html).toContain("Program note: ");
    expect(html).toContain("program text");
    expect(html).toContain("session text");

    // The textarea's value is the SESSION note only — the program note has
    // not leaked into the editable control, which is the whole distinction
    // this feature exists to draw.
    const textarea = /<textarea[^>]*>([\s\S]*?)<\/textarea>/.exec(html);
    expect(textarea).not.toBeNull();
    expect(textarea?.[1]).toBe("session text");
    expect(textarea?.[1]).not.toContain("program text");

    // …and the program note is not rendered inside any editable control.
    expect(html).toContain('<span class="text-slate-500">Program note: </span>program text');
  });

  it("(f) a skipped slot still shows both — the context is what informs unskipping", () => {
    const html = render(exerciseWith(snapshotData(), { skipped: true }));
    expect(html).toContain("Unskip");
    expect(subtitle(html)).toContain("· Rest 2:30");
    expect(html).toContain("Program note: ");
    expect(html).toContain("Pause 1 s on the chest.");
  });

  it("renders a whitespace-only note as nothing (§5.3's defensive guard)", () => {
    const html = render(exerciseWith(snapshotData({ prescriptionNotes: "   \n  " })));
    expect(html).not.toContain("Program note");
  });

  it("preserves a multiline note's own line breaks and cannot widen the card with a long token", () => {
    const multiline = "Pause 1 s on the chest.\nElbows ~45°.\nNo bounce.";
    const html = render(exerciseWith(snapshotData({ prescriptionNotes: multiline })));

    // The line breaks reach the DOM verbatim — they are part of the
    // instruction — and are made visible by `whitespace-pre-wrap`.
    expect(html).toContain("Elbows ~45°.\nNo bounce.");
    expect(html).toMatch(/class="[^"]*whitespace-pre-wrap[^"]*"/);
    // `break-words` is what keeps a long unbroken token from giving the page
    // a horizontal scrollbar.
    expect(html).toMatch(/class="[^"]*break-words[^"]*"/);
  });

  it("escapes note text rather than rendering it as markup (read-only, plain text)", () => {
    const html = render(exerciseWith(snapshotData({ prescriptionNotes: "<b>bold</b> & 3 < 5" })));
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).toContain("&amp;");
  });

  it("renders sub-minute rest in the plain-seconds form, on the same subtitle line", () => {
    const html = render(exerciseWith(snapshotData({ restSeconds: 45 })));
    const line = subtitle(html);
    expect(line).toContain("· Rest 45 s");
    // Not the logged-set dual form.
    expect(line).not.toContain("Rest 45 s · ");
  });
});
