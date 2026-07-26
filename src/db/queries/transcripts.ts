import { getDb } from "../client";
import type { Transcript, TranscriptSegment } from "@/types/models";

type TranscriptRow = {
  meeting_id: string;
  text: string;
  segments_json: string | null;
  language: string | null;
  generated_at: string;
};

function rowToTranscript(row: TranscriptRow): Transcript {
  return {
    meetingId: row.meeting_id,
    text: row.text,
    segments: row.segments_json ? (JSON.parse(row.segments_json) as TranscriptSegment[]) : null,
    language: row.language,
    generatedAt: row.generated_at,
  };
}

export async function getTranscript(meetingId: string): Promise<Transcript | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<TranscriptRow>("SELECT * FROM transcripts WHERE meeting_id = ?;", [
    meetingId,
  ]);
  return row ? rowToTranscript(row) : null;
}

export async function upsertTranscript(input: {
  meetingId: string;
  text: string;
  segments: TranscriptSegment[];
  language: string | null;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO transcripts (meeting_id, text, segments_json, language, generated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(meeting_id) DO UPDATE SET
       text = excluded.text,
       segments_json = excluded.segments_json,
       language = excluded.language,
       generated_at = excluded.generated_at;`,
    [input.meetingId, input.text, JSON.stringify(input.segments), input.language, new Date().toISOString()],
  );
}
