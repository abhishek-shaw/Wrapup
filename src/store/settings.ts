import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { getCalendarPermissionStatus, requestCalendarPermission } from "@/services/calendar";

const ONBOARDING_COMPLETE_KEY = "wrapup.onboardingComplete";

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
}));
