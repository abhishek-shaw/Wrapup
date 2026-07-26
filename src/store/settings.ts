import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { getCalendarPermissionStatus, requestCalendarPermission } from "@/services/calendar";
import { getNotificationPermissionStatus, requestNotificationPermission } from "@/services/notifications";

const ONBOARDING_COMPLETE_KEY = "wrapup.onboardingComplete";
const REMIND_ABOUT_TODOS_KEY = "wrapup.remindAboutOpenTodos";
const REMINDER_LEAD_TIME_KEY = "wrapup.reminderLeadTimeMinutes";

/** How long before a todo's due date its reminder fires. 0 means "right at
 * the due date" — i.e. the moment it becomes overdue. */
export const REMINDER_LEAD_TIME_OPTIONS = [
  { minutes: 0, label: "At due time" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 1440, label: "1 day before" },
] as const;

type SettingsState = {
  /** null until loadOnboardingStatus() resolves from AsyncStorage. */
  onboardingComplete: boolean | null;
  loadOnboardingStatus: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  /**
   * null until loadCalendarStatus() resolves. Not persisted to AsyncStorage —
   * the OS permission grant is already the source of truth, so this is
   * re-checked live rather than cached, which also picks up the user
   * revoking access from the OS Settings app.
   */
  calendarConnected: boolean | null;
  loadCalendarStatus: () => Promise<void>;
  connectCalendar: () => Promise<boolean>;
  /** Same not-persisted reasoning as calendarConnected above. */
  notificationsEnabled: boolean | null;
  loadNotificationStatus: () => Promise<void>;
  enableNotifications: () => Promise<boolean>;
  /**
   * The user-facing on/off + lead-time preference for todo reminders — this
   * is the "should we schedule at all, and how early" question. Distinct
   * from `notificationsEnabled` above, which is the OS permission grant;
   * both must be true for a reminder to actually fire (see
   * services/notifications' scheduleTodoReminder).
   */
  remindAboutOpenTodos: boolean;
  reminderLeadTimeMinutes: number;
  loadReminderPreferences: () => Promise<void>;
  setRemindAboutOpenTodos: (enabled: boolean) => Promise<void>;
  setReminderLeadTimeMinutes: (minutes: number) => Promise<void>;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  onboardingComplete: null,
  loadOnboardingStatus: async () => {
    const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    set({ onboardingComplete: value === "true" });
  },
  completeOnboarding: async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "true");
    set({ onboardingComplete: true });
  },

  calendarConnected: null,
  loadCalendarStatus: async () => {
    const granted = await getCalendarPermissionStatus();
    set({ calendarConnected: granted });
  },
  connectCalendar: async () => {
    const granted = await requestCalendarPermission();
    set({ calendarConnected: granted });
    return granted;
  },

  notificationsEnabled: null,
  loadNotificationStatus: async () => {
    const granted = await getNotificationPermissionStatus();
    set({ notificationsEnabled: granted });
  },
  enableNotifications: async () => {
    const granted = await requestNotificationPermission();
    set({ notificationsEnabled: granted });
    return granted;
  },

  // Reminders default to on, at the due date itself — this matches the
  // behavior the app already had before these preferences existed, so
  // turning this feature on doesn't change anything for existing users
  // until they deliberately go change it.
  remindAboutOpenTodos: true,
  reminderLeadTimeMinutes: 0,
  loadReminderPreferences: async () => {
    const [remindValue, leadValue] = await Promise.all([
      AsyncStorage.getItem(REMIND_ABOUT_TODOS_KEY),
      AsyncStorage.getItem(REMINDER_LEAD_TIME_KEY),
    ]);
    set({
      remindAboutOpenTodos: remindValue === null ? true : remindValue === "true",
      reminderLeadTimeMinutes: leadValue === null ? 0 : Number(leadValue),
    });
  },
  setRemindAboutOpenTodos: async (enabled: boolean) => {
    await AsyncStorage.setItem(REMIND_ABOUT_TODOS_KEY, enabled.toString());
    set({ remindAboutOpenTodos: enabled });
  },
  setReminderLeadTimeMinutes: async (minutes: number) => {
    await AsyncStorage.setItem(REMINDER_LEAD_TIME_KEY, minutes.toString());
    set({ reminderLeadTimeMinutes: minutes });
  },
}));
