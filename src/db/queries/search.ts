import { getDb } from "../client";

/** Quotes each token as an FTS5 phrase so user input can never be parsed as
 * FTS5 query syntax (column filters, boolean operators, etc). */
function buildFtsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(" ");
}

export async function searchMeetingIds(query: string): Promise<string[]> {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const db = await getDb();
  const rows = await db.getAllAsync<{ meeting_id: string }>(
    "SELECT meeting_id FROM meeting_search WHERE meeting_search MATCH ? ORDER BY rank;",
    [ftsQuery],
  );
  return rows.map((row) => row.meeting_id);
}

export async function indexMeeting(input: {
  meetingId: string;
  title: string;
  summaryText: string;
  transcriptText: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM meeting_search WHERE meeting_id = ?;", [input.meetingId]);
  await db.runAsync(
    `INSERT INTO meeting_search (meeting_id, title, summary_text, transcript_text)
     VALUES (?, ?, ?, ?);`,
    [input.meetingId, input.title, input.summaryText, input.transcriptText],
  );
}
