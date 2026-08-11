import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import {
  credentialsSchema,
  login,
  InvalidCredentialsError,
  ThrottledError,
} from "@/server/auth/service";
import { extractClientIp } from "@/server/http/clientIp";

// Argon2id verification happens inside login() — must stay on the Node
// runtime (not Edge).
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const ip = extractClientIp(request.headers.get("x-forwarded-for")) ?? "unknown";

  try {
    await login(getDb(), parsed.data, { ip });
  } catch (err) {
    if (err instanceof ThrottledError) {
      return NextResponse.json(
        { error: "locked_out", retryAfterMs: err.retryAfterMs },
        { status: 429 },
      );
    }
    if (err instanceof InvalidCredentialsError) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
