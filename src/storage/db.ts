import Database from "@tauri-apps/plugin-sql";

export interface Db {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ lastInsertId?: number }>;
}

export async function openDb(): Promise<Db> {
  return Database.load("sqlite:desktop-dles.db");
}
