import Link from "next/link";
import { SyncBootstrap } from "@/ui/SyncBootstrap";
import { SyncStatusBanner } from "@/ui/SyncStatusBanner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh px-4 py-6">
      <SyncBootstrap />
      <SyncStatusBanner />
      {/* phase-7-review.md BLOCKER-1 — seven links no longer fit one nowrap
          row on any iPhone width (375-430px content area after the parent's
          px-4). `flex-wrap` lets the nav grow to a second/third row instead
          of overflowing the viewport horizontally; every link stays fully
          visible with zero scrolling at any width, which a single
          horizontally-scrolling row would not guarantee. */}
      <nav className="mx-auto mb-6 flex w-full max-w-sm flex-wrap gap-x-4 gap-y-2 text-sm text-slate-400">
        <Link href="/today" className="hover:text-slate-200">
          Today
        </Link>
        <Link href="/history" className="hover:text-slate-200">
          History
        </Link>
        <Link href="/exercises" className="hover:text-slate-200">
          Exercises
        </Link>
        <Link href="/programs" className="hover:text-slate-200">
          Programs
        </Link>
        <Link href="/volume" className="hover:text-slate-200">
          Volume
        </Link>
        <Link href="/bodyweight" className="hover:text-slate-200">
          Bodyweight
        </Link>
        <Link href="/recovery" className="hover:text-slate-200">
          Recovery
        </Link>
      </nav>
      {children}
    </main>
  );
}
