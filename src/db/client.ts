import * as SQLite from "expo-sqlite";

import { runMigrations } from "./schema";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    const opening = SQLite.openDatabaseAsync("wrapup.db").then(async (db) => {
      await runMigrations(db);
      return db;
    });
    dbPromise = opening;
    opening.catch(() => {
      if (dbPromise === opening) {
        dbPromise = null;
      }
    });
  }
  return dbPromise;
}
