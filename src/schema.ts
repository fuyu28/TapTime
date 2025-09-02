import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { password } from "bun";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  tapToken: text("tap_token").unique(),
  createdAt: text("created_at").default(sql`datetime("now")`),
});

export const punches = sqliteTable("punches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  action: text("action", { enum: ["in", "out", "toggle"] }).notNull(),
  at: text("at").notNull(), // ISO(UTC)
  source: text("source"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  lat: real("lat"),
  lng: real("lng"),
  note: text("note"),
});

export const workSessions = sqliteTable("work_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  createdFromPunchId: integer("created_from_punch_id"),
  closedFromPunchId: integer("closed_from_punch_id"),
});
