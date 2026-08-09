import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import {
  credentialsSchema,
  isSetupAvailable,
  setupAccount,
  SetupUnavailableError,
} from "@/server/auth/service";

// Argon2id hashing happens inside setupAccount() — must stay on the Node
// runtime (not Edge).
export const runtime = "nodejs";

export async function GET() {
  const available = await isSetupAvailable(getDb());
  return NextResponse.json({ available });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = credentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    await setupAccount(getDb(), parsed.data);
  } catch (err) {
    if (err instanceof SetupUnavailableError) {
      return NextResponse.json({ error: "setup_unavailable" }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
