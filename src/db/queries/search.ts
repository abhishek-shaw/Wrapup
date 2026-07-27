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

/** Removes a meeting's row from the search index — this virtual FTS5 table
 * has no real foreign key, so deleting a meeting doesn't clean this up on
 * its own the way transcripts/summaries do via ON DELETE CASCADE. */
export async function removeMeetingFromIndex(meetingId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM meeting_search WHERE meeting_id = ?;", [meetingId]);
}

/** Updates just the indexed title, e.g. after a rename — cheaper than
 * re-running indexMeeting, which would need the summary/transcript text too. */
export async function updateSearchTitle(meetingId: string, title: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE meeting_search SET title = ? WHERE meeting_id = ?;", [title, meetingId]);
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
