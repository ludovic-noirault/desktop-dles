import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Db } from "./db";

const migration = readFileSync(
  new URL("../../src-tauri/migrations/001_init.sql", import.meta.url),
  "utf8",
);

export function createTestDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);
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
