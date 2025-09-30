import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, sqliteRaw } from "./db";
import { punches, users, workSessions } from "./schema";
import type {
  PunchRecord,
  PunchResponse,
  PunchStatusResponse,
  WorkSessionRecord,
} from "./shared/types";
import { getIconBase64, type IconSize, ICONS } from "./icons";

const DEFAULT_USERNAME = Bun.env.DEFAULT_USERNAME ?? "demo";
const DEFAULT_PASSWORD = Bun.env.DEFAULT_PASSWORD ?? "password";
const DEFAULT_TAP_TOKEN = Bun.env.DEFAULT_TAP_TOKEN ?? "default-token";

const punchRequestSchema = z.object({
  action: z.union([z.literal("in"), z.literal("out"), z.literal("toggle")]).default("toggle"),
  note: z
    .string()
    .max(200, "メモは200文字以内で入力してください")
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value.trim() : undefined)),
  lat: z.number().finite().nullable().optional(),
  lng: z.number().finite().nullable().optional(),
});

type UserRecord = typeof users.$inferSelect;

let cachedDefaultUser: UserRecord | null = null;

function bootstrapDatabase() {
  sqliteRaw.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      tap_token TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS punches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      at TEXT NOT NULL,
      source TEXT,
      ip TEXT,
      user_agent TEXT,
      lat REAL,
      lng REAL,
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS work_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      started_at TEXT NOT NULL,
      ended_at TEXT,
      created_from_punch_id INTEGER,
      closed_from_punch_id INTEGER
    );
  `);
}

function ensureDefaultUser(): UserRecord {
  if (cachedDefaultUser) {
    return cachedDefaultUser;
  }

  const existing = db.query.users.findFirst({
    where: eq(users.username, DEFAULT_USERNAME),
  });

  if (existing) {
    cachedDefaultUser = existing;
    return existing;
  }

  const passwordHash = Bun.password.hashSync(DEFAULT_PASSWORD);
  const inserted = db
    .insert(users)
    .values({
      username: DEFAULT_USERNAME,
      passwordHash,
      tapToken: DEFAULT_TAP_TOKEN,
    })
    .run();

  const id = Number(inserted.lastInsertRowid);
  const createdUser = db.query.users.findFirst({
    where: eq(users.id, id),
  });

  if (!createdUser) {
    throw new Error("Failed to initialize default user");
  }

  cachedDefaultUser = createdUser;
  return createdUser;
}

function mapPunch(record: typeof punches.$inferSelect): PunchRecord {
  const action = record.action === "in" ? "in" : "out";
  return {
    id: record.id,
    userId: record.userId,
    action,
    at: record.at,
    source: record.source ?? undefined,
    ip: record.ip ?? undefined,
    userAgent: record.userAgent ?? undefined,
    lat: record.lat ?? undefined,
    lng: record.lng ?? undefined,
    note: record.note ?? undefined,
  };
}

function mapSession(record: typeof workSessions.$inferSelect): WorkSessionRecord {
  return {
    id: record.id,
    userId: record.userId,
    startedAt: record.startedAt,
    endedAt: record.endedAt ?? undefined,
    createdFromPunchId: record.createdFromPunchId ?? undefined,
    closedFromPunchId: record.closedFromPunchId ?? undefined,
  };
}

function buildStatus(userId: number): PunchStatusResponse {
  const lastPunchRecord = db
    .select()
    .from(punches)
    .where(eq(punches.userId, userId))
    .orderBy(desc(punches.at))
    .limit(1)
    .get();

  const openSessionRecord = db
    .select()
    .from(workSessions)
    .where(and(eq(workSessions.userId, userId), isNull(workSessions.endedAt)))
    .orderBy(desc(workSessions.startedAt))
    .limit(1)
    .get();

  const recentPunchRecords = db
    .select()
    .from(punches)
    .where(eq(punches.userId, userId))
    .orderBy(desc(punches.at))
    .limit(20)
    .all();

  return {
    status: openSessionRecord ? "in" : "out",
    lastPunch: lastPunchRecord ? mapPunch(lastPunchRecord) : null,
    openSession: openSessionRecord ? mapSession(openSessionRecord) : null,
    recentPunches: recentPunchRecords.map(mapPunch),
  };
}

bootstrapDatabase();

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/status", (c) => {
  const user = ensureDefaultUser();
  const status = buildStatus(user.id);
  return c.json(status satisfies PunchStatusResponse);
});

app.post("/api/punch", zValidator("json", punchRequestSchema), (c) => {
  const user = ensureDefaultUser();
  const payload = c.req.valid("json");

  const statusBefore = buildStatus(user.id);
  const openSession = statusBefore.openSession;
  let action = payload.action;

  if (action === "toggle") {
    action = openSession ? "out" : "in";
  }

  const now = new Date().toISOString();
  const forwardedFor = c.req.header("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0]?.trim() : undefined;
  const userAgent = c.req.header("user-agent") ?? undefined;

  const insertResult = db
    .insert(punches)
    .values({
      userId: user.id,
      action,
      at: now,
      source: "pwa",
      ip,
      userAgent,
      lat: payload.lat,
      lng: payload.lng,
      note: payload.note,
    })
    .run();

  const punchId = Number(insertResult.lastInsertRowid);

  if (action === "in") {
    db.insert(workSessions)
      .values({
        userId: user.id,
        startedAt: now,
        createdFromPunchId: punchId,
      })
      .run();
  } else if (action === "out" && openSession) {
    db.update(workSessions)
      .set({
        endedAt: now,
        closedFromPunchId: punchId,
      })
      .where(eq(workSessions.id, openSession.id))
      .run();
  }

  const statusAfter = buildStatus(user.id);
  const recordedPunch = statusAfter.recentPunches.find((p) => p.id === punchId) ?? {
    id: punchId,
    userId: user.id,
    action,
    at: now,
    source: "pwa",
    ip,
    userAgent,
    lat: payload.lat,
    lng: payload.lng,
    note: payload.note,
  };

  const response: PunchResponse = {
    ...statusAfter,
    recordedPunch,
  };

  return c.json(response satisfies PunchResponse);
});

app.use("/assets/*", serveStatic({ root: "./dist" }));
app.use("/manifest.webmanifest", serveStatic({ root: "./dist" }));
app.use("/sw.js", serveStatic({ root: "./dist" }));
app.get("/icons/icon-:size.png", (c) => {
  const size = c.req.param("size") as IconSize | undefined;

  if (!size || !(size in ICONS)) {
    return c.notFound();
  }

  const base64 = getIconBase64(size);
  const body = Buffer.from(base64, "base64");

  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

app.get("*", serveStatic({ path: "./dist/index.html" }));

const port = Number(Bun.env.PORT ?? 3000);

export default {
  port,
  fetch: app.fetch,
};
