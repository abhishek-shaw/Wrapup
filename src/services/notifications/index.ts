/**
 * expo-notifications wrapper — the only place in the app that talks to
 * `expo-notifications` directly. See AGENTS.md: native module boundaries get
 * a typed wrapper in services/, not ad hoc calls from screens/stores.
 *
 * These are local, on-device scheduled notifications only (todo due-date
 * reminders) — no push service, no remote token, no network call. See
 * AGENTS.md Privacy & Network Rules.
 *
 * Reminders are keyed by the todo's own id, passed as the notification
 * `identifier`, so there's no need for a separate notification-id column in
 * the todos table — scheduling with an id that's already pending simply
 * replaces it, and it's exactly what cancelTodoReminder needs to look it
 * back up.
 */
import * as Notifications from "expo-notifications";

import type { Todo } from "@/types/models";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function getNotificationPermissionStatus(): Promise<boolean> {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

export type TodoReminderPreferences = {
  /** Master on/off switch — see Settings' "Remind me about open action items". */
  enabled: boolean;
  /** How long before the due date to fire, e.g. 0 = at due time, 1440 = a day before. */
  leadTimeMinutes: number;
};

/**
 * Schedules a local reminder for a todo, firing `leadTimeMinutes` before its
 * due date (0 = exactly at the due date, i.e. the moment it becomes
 * overdue). No-ops (after clearing any existing reminder) if reminders are
 * disabled, the todo has no due date, is already completed, the computed
 * fire time has already passed, or notification permission hasn't been
 * granted — so it's always safe to call this whenever a todo's state (or the
 * reminder preferences) changes, rather than needing the caller to check
 * eligibility first.
 */
export async function scheduleTodoReminder(todo: Todo, preferences: TodoReminderPreferences): Promise<void> {
  await cancelTodoReminder(todo.id);

  if (!preferences.enabled || !todo.dueDate || todo.completed) return;
  const fireDate = new Date(new Date(todo.dueDate).getTime() - preferences.leadTimeMinutes * 60_000);
  if (fireDate.getTime() <= Date.now()) return;

  const granted = await getNotificationPermissionStatus();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    identifier: todo.id,
    content: {
      title: preferences.leadTimeMinutes > 0 ? "Action item due soon" : "Action item due",
      body: todo.text,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
  });
}

export async function cancelTodoReminder(todoId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(todoId).catch(() => {});
}
