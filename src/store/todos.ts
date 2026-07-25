import { create } from "zustand";

import { listTodos, setTodoCompleted } from "@/db/queries/todos";
import type { Todo } from "@/types/models";

const DUE_SOON_WINDOW_DAYS = 1;

export function isDueSoonOrOverdue(todo: Todo): boolean {
  if (todo.completed || !todo.dueDate) return false;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + DUE_SOON_WINDOW_DAYS);
  return new Date(todo.dueDate).getTime() <= threshold.getTime();
}

type TodosState = {
  todos: Todo[];
  loaded: boolean;
  load: () => Promise<void>;
  toggle: (id: string) => Promise<void>;
};

export const useTodosStore = create<TodosState>((set, get) => ({
  todos: [],
  loaded: false,
  load: async () => {
    const todos = await listTodos();
    set({ todos, loaded: true });
  },
  toggle: async (id: string) => {
    const target = get().todos.find((todo) => todo.id === id);
    if (!target) return;
    const completed = !target.completed;

    set({
      todos: get().todos.map((todo) =>
        todo.id === id
          ? { ...todo, completed, completedAt: completed ? new Date().toISOString() : null }
          : todo,
      ),
    });

    await setTodoCompleted(id, completed);
  },
}));

export function selectDueSoonCount(state: TodosState): number {
  return state.todos.filter(isDueSoonOrOverdue).length;
}
