"use client";

import { useState } from "react";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 disabled:opacity-50"
    >
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
