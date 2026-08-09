import { LogoutButton } from "@/ui/LogoutButton";

// Phase 0: authenticated empty state only. No exercises, programs, or
// workout logging yet — that begins in later phases.
export default function TodayPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-50">Today</h1>
        <LogoutButton />
      </header>

      <p className="text-sm text-slate-400">Nothing scheduled yet.</p>
    </div>
  );
}
