import { getDb } from "../client";
import type { ChatMessage } from "@/types/models";

type ChatMessageRow = {
  id: string;
  meeting_id: string;
  role: "user" | "assistant";
  text: string;
  created_at: string;
};

function rowToChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    role: row.role,
    text: row.text,
    createdAt: row.created_at,
  };
}

export async function listChatMessages(meetingId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ChatMessageRow>(
    "SELECT * FROM chat_messages WHERE meeting_id = ? ORDER BY created_at ASC;",
    [meetingId],
  );
  return rows.map(rowToChatMessage);
}

export async function createChatMessage(input: {
  id: string;
  meetingId: string;
  role: "user" | "assistant";
  text: string;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO chat_messages (id, meeting_id, role, text, created_at) VALUES (?, ?, ?, ?, ?);`,
    [input.id, input.meetingId, input.role, input.text, new Date().toISOString()],
  );
}
