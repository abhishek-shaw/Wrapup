import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { getCalendarPermissionStatus, requestCalendarPermission } from "@/services/calendar";
import { releaseLlmContext } from "@/services/llm";
import { deleteModel, getDownloadedModelTiers, isModelDownloaded, LLM_MODEL_SPECS, verifyDownloadedModel } from "@/services/llm/models";
import {
  getNotificationPermissionStatus,
  notifyModelVerificationFailed,
  notifyModelVerified,
  requestNotificationPermission,
} from "@/services/notifications";
import type { ModelTier } from "@/types/models";

const ONBOARDING_COMPLETE_KEY = "wrapup.onboardingComplete";
const REMIND_ABOUT_TODOS_KEY = "wrapup.remindAboutOpenTodos";
const REMINDER_LEAD_TIME_KEY = "wrapup.reminderLeadTimeMinutes";
const ACTIVE_MODEL_TIER_KEY = "wrapup.activeModelTier";
const DOWNLOAD_OVER_WIFI_ONLY_KEY = "wrapup.downloadOverWifiOnly";

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

  /**
   * The tier currently used for summarization/action items/chat — null if
   * none is. Multiple tiers can be downloaded and kept on disk at once (see
   * getDownloadedModelTiers); this is just which one is *active* right now.
   * Not the same as "the user's last selection mid-download"; that's owned
   * locally by the choose-model/download-model screens until the download
   * actually finishes, at which point they call setActiveModelTier.
   */
  activeModelTier: ModelTier | null;
  /**
   * Reactive mirror of getDownloadedModelTiers() — the source of truth is
   * still the filesystem, but Settings/choose-model need to re-render when
   * it changes, and a plain isModelDownloaded()/getDownloadedModelTiers()
   * call inside a render body doesn't trigger a re-render on its own when
   * nothing else in the store changes (e.g. deleting a non-active tier used
   * to leave the row showing "Downloaded" until something unrelated forced a
   * re-render). Kept in sync by refreshDownloadedTiers.
   */
  downloadedTiers: ModelTier[];
  refreshDownloadedTiers: () => void;
  downloadOverWifiOnly: boolean;
  loadModelSettings: () => Promise<void>;
  /** Pure preference switch to an already-downloaded tier — no download, no
   * re-verification. Callers must only pass a tier that isModelDownloaded. */
  setActiveModelTier: (tier: ModelTier | null) => Promise<void>;
  setDownloadOverWifiOnly: (enabled: boolean) => Promise<void>;
  /**
   * Deletes one tier's model file on disk. If that tier was the active one,
   * falls back to another still-downloaded tier automatically (the user
   * clearly still wants AI features if they kept another model around) —
   * only clears activeModelTier to null if nothing else is left. Always
   * refreshes downloadedTiers, regardless of whether the deleted tier was active.
   */
  deleteModelTier: (tier: ModelTier) => Promise<void>;
  /**
   * Fraction (0-1) of background checksum verification completed, keyed by
   * tier (see verifyModelInBackground) — a tier's presence as a key means
   * it's actively being verified; absence means it's not. Surfaced as
   * "Verifying… NN%" in Settings/choose-model, since the native hash work is
   * real CPU load that can make the rest of the app feel sluggish while it runs.
   */
  verifyingProgress: Partial<Record<ModelTier, number>>;
  /**
   * Fire-and-forget full checksum verification, kicked off right after a
   * fresh download is marked ready off its fast size check (see
   * download-model.tsx's finalize). Not awaited by callers. Adds/removes
   * `tier` from verifyingTiers for the UI status, and either way notifies
   * the user once it settles: on mismatch, deletes the file, falls back the
   * active tier the same way deleteModelTier does, and notifies that it was
   * removed; on success, notifies that it checked out — all without
   * blocking anything the user is doing in the meantime.
   */
  verifyModelInBackground: (tier: ModelTier) => void;
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
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

  activeModelTier: null,
  downloadedTiers: [],
  refreshDownloadedTiers: () => set({ downloadedTiers: getDownloadedModelTiers() }),
  downloadOverWifiOnly: true,
  loadModelSettings: async () => {
    const [storedTier, storedWifiOnly] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_MODEL_TIER_KEY),
      AsyncStorage.getItem(DOWNLOAD_OVER_WIFI_ONLY_KEY),
    ]);
    // Re-check against the filesystem rather than trusting the cached
    // value blindly — same reasoning as calendarConnected/notificationsEnabled
    // above: the file could've been cleared by the OS or by hand since we
    // last wrote this preference.
    const tier = storedTier as ModelTier | null;
    const stillDownloaded = tier !== null && isModelDownloaded(tier);
    set({
      activeModelTier: stillDownloaded ? tier : null,
      downloadedTiers: getDownloadedModelTiers(),
      downloadOverWifiOnly: storedWifiOnly === null ? true : storedWifiOnly === "true",
    });
  },
  setActiveModelTier: async (tier: ModelTier | null) => {
    if (tier === null) {
      await AsyncStorage.removeItem(ACTIVE_MODEL_TIER_KEY);
    } else {
      await AsyncStorage.setItem(ACTIVE_MODEL_TIER_KEY, tier);
    }
    set({ activeModelTier: tier });
  },
  setDownloadOverWifiOnly: async (enabled: boolean) => {
    await AsyncStorage.setItem(DOWNLOAD_OVER_WIFI_ONLY_KEY, enabled.toString());
    set({ downloadOverWifiOnly: enabled });
  },
  deleteModelTier: async (tier: ModelTier) => {
    const wasActive = get().activeModelTier === tier;
    // Only release the native context if it's the one being deleted —
    // removing a different, inactive tier's file shouldn't disturb a
    // session currently running on the active model.
    if (wasActive) {
      await releaseLlmContext();
    }
    deleteModel(tier);
    // Always refresh, even when the deleted tier wasn't active — otherwise
    // deleting a secondary model leaves Settings/choose-model showing it as
    // still "Downloaded" until something unrelated happens to re-render them.
    get().refreshDownloadedTiers();
    if (!wasActive) return;

    // Fall back to another still-downloaded tier rather than dropping to
    // null — keeping a second model around is a clear signal the user still
    // wants AI features. getDownloadedModelTiers() returns fast/balanced/
    // best_quality order, so this picks the lightest remaining tier first.
    const fallbackTier = getDownloadedModelTiers()[0] ?? null;
    if (fallbackTier) {
      await AsyncStorage.setItem(ACTIVE_MODEL_TIER_KEY, fallbackTier);
    } else {
      await AsyncStorage.removeItem(ACTIVE_MODEL_TIER_KEY);
    }
    set({ activeModelTier: fallbackTier });
  },
  verifyingProgress: {},
  verifyModelInBackground: (tier: ModelTier) => {
    set((state) => ({ verifyingProgress: { ...state.verifyingProgress, [tier]: 0 } }));
    verifyDownloadedModel(tier, (fraction) => {
      set((state) => ({ verifyingProgress: { ...state.verifyingProgress, [tier]: fraction } }));
    })
      .then(async (verified) => {
        if (verified) {
          await notifyModelVerified(LLM_MODEL_SPECS[tier].label);
          return;
        }
        // verifyDownloadedModel already deleted the corrupt file — reuse
        // deleteModelTier purely for its "release context + fall back the
        // active tier" side effects, same as an explicit user delete.
        await get().deleteModelTier(tier);
        await notifyModelVerificationFailed(LLM_MODEL_SPECS[tier].label);
      })
      .catch(() => {
        // Best-effort background check — an IO error reading the file back
        // isn't proof of corruption, so leave the model as-is rather than
        // deleting it on a hunch.
      })
      .finally(() => {
        set((state) => {
          const next = { ...state.verifyingProgress };
          delete next[tier];
          return { verifyingProgress: next };
        });
      });
  },
}));
