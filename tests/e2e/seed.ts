// One-time (idempotent) local data setup for the Phase 3 e2e specs. Not run
// automatically by `pnpm test:e2e` (Playwright's webServer only starts
// `pnpm dev`, no DB seeding) — run by hand against the real dev Postgres
// before executing today.spec.ts / offline-sync.spec.ts:
//
//   $env:DATABASE_URL="postgres://gymapp:gymapp@localhost:5432/gymapp"; pnpm tsx tests/e2e/seed.ts
//
// Reuses the same fixed account as smoke.spec.ts (ADR-004: only one account
// ever exists) and whatever exercise catalog is already seeded for it. Every
// step is find-or-create so re-running against an already-seeded dev DB is a
// no-op. A single rotation-mode schedule entry (no `weekdays`) is used
// deliberately — it resolves to the same template on every calendar day
// (domain/scheduling/todayTemplate.ts), which is what makes the e2e specs
// repeatable regardless of which weekday they're run on.
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  blocks,
  exercisePrescriptions,
  exercises,
  programs,
  users,
  workoutTemplates,
} from "@/db/schema";
import { isSetupAvailable, setupAccount } from "@/server/auth/service";
import { createProgram } from "@/server/programs/service";
import { createTemplate } from "@/server/templates/service";
import { createBlock, activateBlock } from "@/server/blocks/service";
import { createPrescription } from "@/server/prescriptions/service";

export const E2E_EMAIL = "e2e-smoke@example.com";
export const E2E_PASSWORD = "e2e-smoke-password";
const E2E_PROGRAM_NAME = "E2E Phase 3 Program";
const E2E_TEMPLATE_NAME = "E2E Phase 3 Day";

async function main() {
  const db = getDb();

  const [existingUser] = await db.select().from(users).where(eq(users.email, E2E_EMAIL));
  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
  } else {
    if (!(await isSetupAvailable(db))) {
      throw new Error(
        `No user "${E2E_EMAIL}" exists and setup is unavailable — a different account already occupies ` +
          "this single-account app (ADR-004). Point DATABASE_URL at a fresh dev DB or adjust E2E_EMAIL.",
      );
    }
    userId = (await setupAccount(db, { email: E2E_EMAIL, password: E2E_PASSWORD })).id;
  }

  const [exercise] = await db.select().from(exercises).where(eq(exercises.userId, userId)).limit(1);
  if (!exercise) {
    throw new Error(
      "Expected at least one exercise already seeded for the e2e user (the catalog import that runs on " +
        "first account setup). Found none — is this a fresh/unseeded dev DB?",
    );
  }

  let [program] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.userId, userId), eq(programs.name, E2E_PROGRAM_NAME)));
  if (!program) {
    program = await createProgram(db, userId, { name: E2E_PROGRAM_NAME });
  }

  let [template] = await db
    .select()
    .from(workoutTemplates)
    .where(
      and(eq(workoutTemplates.programId, program.id), eq(workoutTemplates.name, E2E_TEMPLATE_NAME)),
    );
  if (!template) {
    const created = await createTemplate(db, userId, program.id, { name: E2E_TEMPLATE_NAME });
    if (!created) throw new Error("failed to create e2e template");
    template = created;
  }

  const prescriptionRows = await db
    .select()
    .from(exercisePrescriptions)
    .where(eq(exercisePrescriptions.templateId, template.id));
  if (prescriptionRows.length === 0) {
    const created = await createPrescription(db, userId, template.id, {
      exerciseId: exercise.id,
      scheme: { v: 1, scheme: { type: "fixed", sets: 3, reps: 5 } },
      progression: { strategyId: "manual" },
    });
    if (!created) throw new Error("failed to create e2e prescription");
  }

  const [existingBlock] = await db.select().from(blocks).where(eq(blocks.programId, program.id));
  let blockId: string;
  let blockStatus: string;
  if (existingBlock) {
    blockId = existingBlock.id;
    blockStatus = existingBlock.status;
  } else {
    const created = await createBlock(db, userId, program.id, {
      name: "E2E Phase 3 Block",
      goal: "general",
      startDate: new Date().toISOString().slice(0, 10),
      weeksPlanned: 16,
      schedule: [{ templateId: template.id }],
    });
    if (!created) throw new Error("failed to create e2e block");
    blockId = created.id;
    blockStatus = created.status;
  }

  if (blockStatus !== "active") {
    await activateBlock(db, userId, blockId);
  }

  console.log(
    `E2E seed ready: user=${userId} program=${program.id} template=${template.id} block=${blockId}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
