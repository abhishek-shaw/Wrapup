import { getDb } from "../client";
import type { Todo } from "@/types/models";

type TodoRow = {
  id: string;
  meeting_id: string | null;
  text: string;
  owner_hint: string | null;
  due_date: string | null;
  completed: number;
  completed_at: string | null;
  created_at: string;
};

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    text: row.text,
    ownerHint: row.owner_hint,
    dueDate: row.due_date,
    completed: row.completed === 1,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export async function listTodos(): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TodoRow>("SELECT * FROM todos ORDER BY created_at DESC;");
  return rows.map(rowToTodo);
}

export async function listTodosForMeeting(meetingId: string): Promise<Todo[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<TodoRow>(
    "SELECT * FROM todos WHERE meeting_id = ? ORDER BY created_at ASC;",
    [meetingId],
  );
  return rows.map(rowToTodo);
}

export async function createTodo(input: {
  id: string;
  meetingId: string | null;
  text: string;
  ownerHint?: string | null;
  dueDate?: string | null;
  completed?: boolean;
}): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO todos (id, meeting_id, text, owner_hint, due_date, completed, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      input.id,
      input.meetingId,
      input.text,
      input.ownerHint ?? null,
      input.dueDate ?? null,
      input.completed ? 1 : 0,
      input.completed ? new Date().toISOString() : null,
      new Date().toISOString(),
    ],
  );
}

/** Clears a meeting's action items before regenerating them (see the
 * meeting detail screen's "Reprocess" action) — without this, reprocessing
 * would append a second copy of every action item instead of replacing them. */
export async function deleteTodosForMeeting(meetingId: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("DELETE FROM todos WHERE meeting_id = ?;", [meetingId]);
}

export async function setTodoCompleted(id: string, completed: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE todos SET completed = ?, completed_at = ? WHERE id = ?;", [
    completed ? 1 : 0,
    completed ? new Date().toISOString() : null,
    id,
  ]);
}
