"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/Button";

type Status = "checking" | "ready" | "submitting";

function formatRetryAfter(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)}m`;
}

export function LoginForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/setup")
      .then((res) => res.json())
      .then((data: { available: boolean }) => {
        if (cancelled) return;
        if (data.available) {
          router.replace("/setup");
          return;
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatus("submitting");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        window.location.assign("/today");
        return;
      }

      const data = await res.json().catch(() => null);
      if (res.status === 429) {
        const retryAfterMs = typeof data?.retryAfterMs === "number" ? data.retryAfterMs : 0;
        setError(`Too many attempts. Try again in ${formatRetryAfter(retryAfterMs)}.`);
      } else if (res.status === 401) {
        setError("Invalid email or password.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setStatus("ready");
    } catch {
      setError("Network error. Please try again.");
      setStatus("ready");
    }
  }

  if (status === "checking") {
    return <p className="text-center text-sm text-slate-400">Loading…</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-50">Log in</h1>

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-slate-300">
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-base text-slate-50 outline-none focus:border-slate-400"
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
