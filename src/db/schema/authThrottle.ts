import { pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

export const authThrottle = pgTable("auth_throttle", {
  identifier: text("identifier").primaryKey(),
  failureCount: smallint("failure_count").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});
