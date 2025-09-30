import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_URL = Bun.env.DATABASE_URL ?? "data/app.db";
const DB_PATH = DB_URL.startsWith("file:") ? DB_URL.replace("file:", "") : DB_URL;

mkdirSync(dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH, { create: true });
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

export const sqliteRaw = sqlite;
