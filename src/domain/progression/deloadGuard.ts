// H-1 remediation — prescription-model.md §5 / progression-engine.md §7: a
// deload session must never surface, apply, or implicitly decide a pending
// recommendation. The underlying record is untouched by this — it stays
// `pending` server-side and resurfaces on the next non-deload session; this
// only gates what a deload context is allowed to read.
//
// Every boundary that could carry a recommendation into a deload context
// calls this single function, including ones that must stay defensive
// against a stale pre-fix shape where the recommendation is already attached
// (an offline-cached bundle fetched before this fix deployed, or an
// in-progress session already hydrated locally before it): buildTodayBundle
// and getActiveSession (server), startSession/logSet/decideRecommendation
// (client), and ExerciseCard's prefill/card-render (UI).
export function recommendationForDeload<T>(isDeload: boolean, recommendation: T | null): T | null {
  return isDeload ? null : recommendation;
}
