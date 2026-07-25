/**
 * Wrapup SQLite schema.
 *
 * This is the source of truth for meetings, transcripts, summaries,
 * todos, and per-meeting chat history. AsyncStorage is NOT used for
 * any of this — only for lightweight preference flags, if at all.
 *
 * Run `SCHEMA_STATEMENTS` in order against a fresh expo-sqlite (or
 * op-sqlite) database. For migrations later, add a `schema_version`
 * table and a versioned migration runner rather than editing these
 * CREATE TABLE statements in place once the app has shipped.
 */

export const SCHEMA_STATEMENTS: string[] = [
  `PRAGMA foreign_keys = ON;`,

  `CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    calendar_event_id TEXT,
    source TEXT NOT NULL CHECK (source IN ('calendar_meeting', 'manual_dictation')),
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER,
    attendee_count INTEGER,
    status TEXT NOT NULL CHECK (status IN ('recording', 'processing', 'ready', 'failed')),
    audio_file_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  `CREATE INDEX IF NOT EXISTS idx_meetings_started_at ON meetings(started_at);`,
  `CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);`,

  `CREATE TABLE IF NOT EXISTS transcripts (
    meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    segments_json TEXT,
    language TEXT,
    generated_at TEXT NOT NULL
  );`,

  `CREATE TABLE IF NOT EXISTS summaries (
    meeting_id TEXT PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    model_tier TEXT CHECK (model_tier IN ('fast', 'balanced', 'best_quality'))
  );`,

  `CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    meeting_id TEXT REFERENCES meetings(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    owner_hint TEXT,
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    completed_at TEXT,
    created_at TEXT NOT NULL
  );`,

  `CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);`,
  `CREATE INDEX IF NOT EXISTS idx_todos_due_date ON todos(due_date);`,

  `CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    text TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,

  `CREATE INDEX IF NOT EXISTS idx_chat_messages_meeting_id ON chat_messages(meeting_id);`,

  // Full-text search over transcript + summary text, powering the
  // Library tab's search. See AGENTS.md — do not replace this with a
  // naive LIKE query, it won't stay fast as recordings accumulate.
  `CREATE VIRTUAL TABLE IF NOT EXISTS meeting_search USING fts5(
    meeting_id UNINDEXED,
    title,
    summary_text,
    transcript_text
  );`,
];

/**
 * Call this once at app startup, before any other db access.
 * Example usage with expo-sqlite:
 *
 *   const db = await SQLite.openDatabaseAsync('wrapup.db');
 *   await runMigrations(db);
 */
export async function runMigrations(db: {
  execAsync: (sql: string) => Promise<unknown>;
}): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await db.execAsync(statement);
  }
}
