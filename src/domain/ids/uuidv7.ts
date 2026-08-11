import { uuidv7 as generate } from "uuidv7";

// The one narrow exception to domain's "zod only" import rule (ADR-001):
// per data-model.md §1, UUIDv7 IDs must be generated identically on the
// server (this phase) and, from Phase 3 onward, the offline client outbox.
// Domain is the only layer both worlds import from, so it is the correct
// home for the shared generator even though it isn't a Zod schema itself.
export function newId(): string {
  return generate();
}

const UUIDV7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidv7(value: string): boolean {
  return UUIDV7_PATTERN.test(value);
}
