import type { ButtonHTMLAttributes } from "react";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`w-full rounded-lg bg-slate-100 px-4 py-3 text-base font-medium text-slate-900 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
