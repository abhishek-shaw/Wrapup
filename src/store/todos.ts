import { create } from "zustand";

import { listTodos, setTodoCompleted } from "@/db/queries/todos";
import { scheduleTodoReminder, type TodoReminderPreferences } from "@/services/notifications";
import { useSettingsStore } from "@/store/settings";
import type { Todo } from "@/types/models";

const DUE_SOON_WINDOW_DAYS = 1;

export function isDueSoonOrOverdue(todo: Todo): boolean {
  if (todo.completed || !todo.dueDate) return false;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + DUE_SOON_WINDOW_DAYS);
  return new Date(todo.dueDate).getTime() <= threshold.getTime();
}

/** Reads the live reminder preferences straight from the settings store
 * rather than taking them as arguments — every call site here already runs
 * inside a store action, so this keeps `load`/`toggle`/`resyncReminders`
 * from each having to plumb settings through themselves. */
function getReminderPreferences(): TodoReminderPreferences {
  const { remindAboutOpenTodos, reminderLeadTimeMinutes } = useSettingsStore.getState();
  return { enabled: remindAboutOpenTodos, leadTimeMinutes: reminderLeadTimeMinutes };
}

type TodosState = {
  todos: Todo[];
  loaded: boolean;
  load: () => Promise<void>;
  toggle: (id: string) => Promise<void>;
  /** Re-applies reminder scheduling for every loaded todo against the
   * current preferences — call after the user changes the reminder toggle
   * or lead time in Settings, so the change takes effect immediately rather
   * than waiting for the next app launch. */
  resyncReminders: () => Promise<void>;
};

export const useTodosStore = create<TodosState>((set, get) => ({
  todos: [],
  loaded: false,
  load: async () => {
    const todos = await listTodos();
    set({ todos, loaded: true });
    // Reminders are keyed by todo id (see services/notifications), so
    // re-scheduling on every load is just a no-op replace for todos whose
    // due date hasn't changed — this is also what picks up reminders for
    // todos that existed before notification permission was granted.
    const preferences = getReminderPreferences();
    await Promise.all(todos.map((todo) => scheduleTodoReminder(todo, preferences)));
  },
  toggle: async (id: string) => {
    const target = get().todos.find((todo) => todo.id === id);
    if (!target) return;
    const completed = !target.completed;
    const updated: Todo = { ...target, completed, completedAt: completed ? new Date().toISOString() : null };

    set({
      todos: get().todos.map((todo) => (todo.id === id ? updated : todo)),
    });

    await setTodoCompleted(id, completed);
    // Cancels the reminder when completing, reschedules it (if still
    // eligible) when marked incomplete again.
    await scheduleTodoReminder(updated, getReminderPreferences());
  },
  resyncReminders: async () => {
    const preferences = getReminderPreferences();
    await Promise.all(get().todos.map((todo) => scheduleTodoReminder(todo, preferences)));
  },
}));

export function selectDueSoonCount(state: TodosState): number {
  return state.todos.filter(isDueSoonOrOverdue).length;
}
