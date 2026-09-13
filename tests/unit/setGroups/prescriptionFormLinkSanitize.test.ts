import { describe, expect, it } from "vitest";
import {
  emptyGroupDraft,
  sanitizeGroupLinks,
  type GroupDraft,
} from "@/ui/prescriptions/PrescriptionForm";

// Stage B remediation F-8 (set-groups-stage-b-review.md) — `sanitizeGroupLinks`
// previously had exactly one test, an E2E spec driving a real `↑` reorder;
// two of the three invalidation causes the notice itself enumerates (the
// reference group being REMOVED, and the reference group itself BECOMING
// LINKED) had no coverage at any level. These are the unit-level companions;
// tests/e2e/setGroups.spec.ts adds the matching browser-level coverage.

function linkedDraft(overrides: Partial<GroupDraft> = {}): GroupDraft {
  return { ...emptyGroupDraft("Back-off"), linkEnabled: true, linkPercent: "80", ...overrides };
}

describe("sanitizeGroupLinks", () => {
  it("leaves a valid link (earlier, unlinked target) untouched", () => {
    const top = emptyGroupDraft("Top");
    const backoff = linkedDraft({ linkRefDraftId: top.draftId });
    const { groups, cleared } = sanitizeGroupLinks([top, backoff]);
    expect(cleared).toEqual([]);
    expect(groups[1]).toEqual(backoff);
  });

  it("leaves a freshly-checked link with no reference chosen yet untouched (mid-edit, not invalid)", () => {
    const top = emptyGroupDraft("Top");
    const backoff = linkedDraft({ linkRefDraftId: "" });
    const { groups, cleared } = sanitizeGroupLinks([top, backoff]);
    expect(cleared).toEqual([]);
    expect(groups[1]!.linkEnabled).toBe(true);
    expect(groups[1]!.linkRefDraftId).toBe("");
  });

  // F-8 — untested cause #1: the reference group is removed from the array
  // entirely (simulating what `removeGroup` produces before this function
  // ever sees it).
  it("clears the link when its reference group has been removed", () => {
    const top = emptyGroupDraft("Top");
    const backoff = linkedDraft({ linkRefDraftId: top.draftId, strategyOverride: "manual" });
    // Top is gone — exactly the array `removeGroup(0)` would produce.
    const { groups, cleared } = sanitizeGroupLinks([backoff]);
    expect(cleared).toEqual(["Back-off"]);
    expect(groups[0]).toMatchObject({
      linkEnabled: false,
      linkRefDraftId: "",
      linkPercent: "",
      strategyOverride: "",
    });
  });

  // F-8 — untested cause #2: the reference group itself becomes linked
  // (chaining is forbidden — the reference must be itself unlinked).
  it("clears the link when its reference group itself becomes linked", () => {
    const top = emptyGroupDraft("Top");
    const mid = linkedDraft({ label: "Mid", linkRefDraftId: top.draftId });
    const last = linkedDraft({ label: "Last", linkRefDraftId: mid.draftId });
    const { groups, cleared } = sanitizeGroupLinks([top, mid, last]);
    // Mid's own link (to Top) is valid and untouched; Last's link (to Mid,
    // which is itself now linked) is the one invalidated.
    expect(cleared).toEqual(["Last"]);
    expect(groups[1]).toEqual(mid);
    expect(groups[2]).toMatchObject({ linkEnabled: false, linkRefDraftId: "" });
  });

  it("clears the link when reordering leaves the reference no longer earlier", () => {
    const top = emptyGroupDraft("Top");
    const backoff = linkedDraft({ linkRefDraftId: top.draftId });
    // Simulates `moveGroup` swapping Back-off above Top.
    const { groups, cleared } = sanitizeGroupLinks([backoff, top]);
    expect(cleared).toEqual(["Back-off"]);
    expect(groups[0]).toMatchObject({ linkEnabled: false, linkRefDraftId: "" });
  });

  it("clears a self-reference defensively (never constructible through the UI, still handled)", () => {
    const solo = linkedDraft({ label: "Solo" });
    const { groups, cleared } = sanitizeGroupLinks([{ ...solo, linkRefDraftId: solo.draftId }]);
    expect(cleared).toEqual(["Solo"]);
    expect(groups[0]!.linkEnabled).toBe(false);
  });

  it("reports each cleared group by its own label, falling back to a positional name for a blank label", () => {
    const top = emptyGroupDraft("Top");
    const blank = linkedDraft({ label: "   ", linkRefDraftId: "nonexistent" });
    const { cleared } = sanitizeGroupLinks([top, blank]);
    expect(cleared).toEqual(["Group 2"]);
  });

  it("clearing one invalid link never disturbs an unrelated valid link elsewhere", () => {
    const top = emptyGroupDraft("Top");
    const validBackoff = linkedDraft({ label: "Back-off", linkRefDraftId: top.draftId });
    const danglingBackoff2 = linkedDraft({ label: "Back-off 2", linkRefDraftId: "gone" });
    const { groups, cleared } = sanitizeGroupLinks([top, validBackoff, danglingBackoff2]);
    expect(cleared).toEqual(["Back-off 2"]);
    expect(groups[1]).toEqual(validBackoff);
  });
});
