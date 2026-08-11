import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh px-4 py-6">
      <nav className="mx-auto mb-6 flex w-full max-w-sm gap-4 text-sm text-slate-400">
        <Link href="/today" className="hover:text-slate-200">
          Today
        </Link>
        <Link href="/exercises" className="hover:text-slate-200">
          Exercises
        </Link>
      </nav>
      {children}
    </main>
  );
}
