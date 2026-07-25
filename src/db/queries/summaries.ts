import { getDb } from "../client";
import type { ModelTier, Summary } from "@/types/models";

type SummaryRow = {
  meeting_id: string;
  summary_text: string;
  generated_at: string;
  model_tier: ModelTier | null;
};

function rowToSummary(row: SummaryRow): Summary {
  return {
    meetingId: row.meeting_id,
    summaryText: row.summary_text,
    generatedAt: row.generated_at,
    modelTier: row.model_tier,
  };
}

export async function getSummary(meetingId: string): Promise<Summary | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SummaryRow>("SELECT * FROM summaries WHERE meeting_id = ?;", [
    meetingId,
  ]);
  return row ? rowToSummary(row) : null;
}

export async function upsertSummary(input: {
  meetingId: string;
  summaryText: string;
  modelTier: ModelTier | null;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO summaries (meeting_id, summary_text, generated_at, model_tier)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(meeting_id) DO UPDATE SET
       summary_text = excluded.summary_text,
       generated_at = excluded.generated_at,
       model_tier = excluded.model_tier;`,
    [input.meetingId, input.summaryText, new Date().toISOString(), input.modelTier],
  );
}
