import { getDb } from "../client";
import type { Meeting, RecordingSource, RecordingStatus } from "@/types/models";

type MeetingRow = {
  id: string;
  title: string;
  calendar_event_id: string | null;
  source: RecordingSource;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  attendee_count: number | null;
  status: RecordingStatus;
  audio_file_path: string | null;
  created_at: string;
  updated_at: string;
};

function rowToMeeting(row: MeetingRow): Meeting {
  return {
    id: row.id,
    title: row.title,
    calendarEventId: row.calendar_event_id,
    source: row.source,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSeconds: row.duration_seconds,
    attendeeCount: row.attendee_count,
    status: row.status,
    audioFilePath: row.audio_file_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMeetings(): Promise<Meeting[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MeetingRow>("SELECT * FROM meetings ORDER BY started_at DESC;");
  return rows.map(rowToMeeting);
}

/** Meetings joined with a short summary snippet, for list views that show a
 * one-line preview (e.g. the Library tab) without a separate query per row. */
export async function listMeetingsWithPreview(): Promise<(Meeting & { previewText: string | null })[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MeetingRow & { summary_text: string | null }>(
    `SELECT m.*, s.summary_text
     FROM meetings m
     LEFT JOIN summaries s ON s.meeting_id = m.id
     ORDER BY m.started_at DESC;`,
  );
  return rows.map((row) => ({ ...rowToMeeting(row), previewText: row.summary_text }));
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<MeetingRow>("SELECT * FROM meetings WHERE id = ?;", [id]);
  return row ? rowToMeeting(row) : null;
}

export async function createMeeting(input: {
  id: string;
  title: string;
  calendarEventId?: string | null;
  source: RecordingSource;
  startedAt: string;
  status: RecordingStatus;
}): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO meetings (id, title, calendar_event_id, source, started_at, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      input.id,
      input.title,
      input.calendarEventId ?? null,
      input.source,
      input.startedAt,
      input.status,
      now,
      now,
    ],
  );
}

export async function updateMeetingStatus(id: string, status: RecordingStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE meetings SET status = ?, updated_at = ? WHERE id = ?;", [
    status,
    new Date().toISOString(),
    id,
  ]);
}

/** Persists where the captured audio landed once recording stops. */
export async function finishRecording(
  id: string,
  input: { audioFilePath: string; endedAt: string; durationSeconds: number },
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE meetings SET audio_file_path = ?, ended_at = ?, duration_seconds = ?, updated_at = ? WHERE id = ?;`,
    [input.audioFilePath, input.endedAt, input.durationSeconds, new Date().toISOString(), id],
  );
}
