// Re-exports the `db` layer's connection accessor for use by the `server`
// layer's own modules and, through them, by `api` route handlers — which
// are not permitted to import `@/db/client` directly (architecture boundary:
// api -> server -> db, never api -> db).
export { getDb } from "@/db/client";
export type { AppDb } from "@/db/client";
