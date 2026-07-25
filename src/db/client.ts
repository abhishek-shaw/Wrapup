import * as SQLite from "expo-sqlite";

import { runMigrations } from "./schema";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync("wrapup.db").then(async (db) => {
      await runMigrations(db);
      return db;
    });
  }
  return dbPromise;
}
