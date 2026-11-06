import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Db } from "./db";

const migrations = [
  "001_init.sql",
  "002_day_status.sql",
  "003_daily_pick.sql",
].map((file) =>
  readFileSync(
    new URL(`../../src-tauri/migrations/${file}`, import.meta.url),
    "utf8",
  ),
);

export function createTestDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of migrations) sqlite.exec(migration);
  return {
    async select<T>(sql: string, params: unknown[] = []) {
      return sqlite.prepare(sql).all(...(params as SQLInputValue[])) as T[];
    },
    async execute(sql, params = []) {
      const { lastInsertRowid } = sqlite
        .prepare(sql)
        .run(...(params as SQLInputValue[]));
      return { lastInsertId: Number(lastInsertRowid) };
    },
  };
}
