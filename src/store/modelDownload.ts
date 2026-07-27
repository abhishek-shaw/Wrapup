/**
 * Owns the full lifecycle of an on-device model download — progress,
 * pause/resume, Wi-Fi gating, and cross-restart persistence — as global
 * store state rather than screen-local state (as it used to live in
 * download-model.tsx). Two problems drove this:
 *
 * 1. Leaving the download screen (back button, switching tabs) must not
 *    lose progress tracking — PersistentModelDownloadBanner needs to show
 *    status from anywhere, the same way PersistentRecordingBanner already
 *    does for recording.
 * 2. Surviving an actual app kill mid-download, not just backgrounding.
 *    expo-file-system's `DownloadTask` instance and its promise don't
 *    survive process termination (per its own docs), even though iOS's
 *    background URLSession keeps the transfer itself alive. So on
 *    backgrounding, this pauses the transfer and persists its resumable
 *    state (`task.savable()`) to AsyncStorage; `restorePendingDownload()`
 *    reconstructs it (`DownloadTask.fromSavable()`) on next launch, so a
 *    kill mid-download resumes from where it left off instead of restarting
 *    the whole multi-GB transfer.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DownloadPauseState, DownloadTask } from "expo-file-system";
import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";
import { create } from "zustand";

import {
  createModelDownloadTask,
  deleteModel,
  isModelDownloaded,
  isOnWifi,
  LLM_MODEL_SPECS,
  resumeModelDownloadTask,
} from "@/services/llm/models";
import { useSettingsStore } from "@/store/settings";
import type { ModelTier } from "@/types/models";

const PENDING_DOWNLOAD_KEY = "wrapup.pendingModelDownload";

export type ModelDownloadOrigin = "onboarding" | "settings";
export type ModelDownloadPhase = "waiting_for_wifi" | "downloading" | "paused" | "done" | "error";

export type ActiveModelDownload = {
  tier: ModelTier;
  origin: ModelDownloadOrigin;
  wifiOnly: boolean;
  phase: ModelDownloadPhase;
  bytesWritten: number;
  totalBytes: number;
  errorMessage: string | null;
};

type PersistedPendingDownload = {
  tier: ModelTier;
  origin: ModelDownloadOrigin;
  wifiOnly: boolean;
  bytesWritten: number;
  totalBytes: number;
  pauseState: DownloadPauseState;
};

type ModelDownloadState = {
  activeDownload: ActiveModelDownload | null;
  /** No-ops if a download is already in progress — callers should check
   * `activeDownload` first and let the user know rather than relying on this
   * silently ignoring the request. */
  startDownload: (params: { tier: ModelTier; origin: ModelDownloadOrigin; wifiOnly: boolean }) => void;
  pauseDownload: () => Promise<void>;
  resumeDownload: () => Promise<void>;
  cancelDownload: () => void;
  /** Dismisses a finished ("done") or failed ("error") download so the banner/screen clears. */
  clearDownload: () => void;
  /** Call once at app startup. Reconstructs a download that was paused —
   * either by the user or by this store pausing it for backgrounding —
   * before the app was killed, and attempts to pick up where it left off. */
  restorePendingDownload: () => Promise<void>;
};

// Module-level, not store state: the native task handle isn't plain data and
// doesn't need to be reactive — only the fields in ActiveModelDownload do.
// Mirrors the cachedContext pattern in services/llm/index.ts.
let currentTask: DownloadTask | null = null;
// True only when *this store* paused for backgrounding, not when the user
// tapped Pause directly — distinguishes "resume automatically once
// foregrounded (or back on Wi-Fi)" from "the user asked for this to stay
// paused," so returning to the app never overrides an explicit user choice.
let pausedForBackgrounding = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let listenersStarted = false;

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function persistPauseState(download: ActiveModelDownload) {
  if (!currentTask) return;
  try {
    const pauseState = currentTask.savable();
    const persisted: PersistedPendingDownload = {
      tier: download.tier,
      origin: download.origin,
      wifiOnly: download.wifiOnly,
      bytesWritten: download.bytesWritten,
      totalBytes: download.totalBytes,
      pauseState,
    };
    await AsyncStorage.setItem(PENDING_DOWNLOAD_KEY, JSON.stringify(persisted));
  } catch {
    // Best-effort — if this fails, the worst case is starting the download
    // over after a kill, same as before this feature existed.
  }
}

async function clearPersistedPauseState() {
  await AsyncStorage.removeItem(PENDING_DOWNLOAD_KEY).catch(() => {});
}

export const useModelDownloadStore = create<ModelDownloadState>((set, get) => {
  function startPolling(tier: ModelTier) {
    stopPolling();
    // Independent safety net for a `DownloadTask` bug observed after a
    // pause→resume→complete cycle: the underlying network transfer finishes
    // (confirmed via OS-level logs and the file landing on disk at the exact
    // expected size), but the `resumeAsync()`/`downloadAsync()` promise never
    // resolves, leaving the UI stuck at 100% forever with no way out. Rather
    // than trust progress events (which is what left this stuck in the first
    // place), poll the filesystem directly while a download is in flight —
    // this catches completion regardless of whether the native promise or
    // progress callback ever fires again.
    pollInterval = setInterval(() => {
      const download = get().activeDownload;
      if (download && download.tier === tier && download.phase === "downloading" && isModelDownloaded(tier)) {
        finishSuccessfully(tier);
      }
    }, 2000);
  }

  async function finishSuccessfully(tier: ModelTier) {
    stopPolling();
    await clearPersistedPauseState();
    // The size check that got us here is what unblocks the user immediately;
    // the full checksum runs after, off the critical path (see
    // useSettingsStore's verifyModelInBackground).
    const settingsStore = useSettingsStore.getState();
    await settingsStore.setActiveModelTier(tier);
    settingsStore.refreshDownloadedTiers();
    settingsStore.verifyModelInBackground(tier);
    set((state) =>
      state.activeDownload?.tier === tier ? { activeDownload: { ...state.activeDownload, phase: "done" } } : state,
    );
    // Clear shortly after — long enough for download-model.tsx's own "done"
    // checkmark moment (it auto-navigates away after 900ms) to have shown.
    // Without this, activeDownload stayed populated forever: Settings/
    // choose-model kept showing the download-in-progress "View" control
    // instead of falling back to the normal Active/Delete row once
    // background verification finished, and startDownload's activeDownload
    // guard would have permanently blocked starting any future download.
    setTimeout(() => {
      set((state) =>
        state.activeDownload?.tier === tier && state.activeDownload.phase === "done" ? { activeDownload: null } : state,
      );
      currentTask = null;
    }, 1200);
  }

  async function beginTransfer(tier: ModelTier) {
    set((state) =>
      state.activeDownload?.tier === tier
        ? { activeDownload: { ...state.activeDownload, phase: "downloading", errorMessage: null } }
        : state,
    );
    try {
      const task = createModelDownloadTask(tier, (bytesWritten) => {
        set((state) =>
          state.activeDownload?.tier === tier ? { activeDownload: { ...state.activeDownload, bytesWritten } } : state,
        );
      });
      currentTask = task;
      startPolling(tier);
      const result = await task.downloadAsync();
      if (result === null) return; // paused mid-transfer — pauseDownload/resumeDownload (or the listeners below) drive the rest
      await finishSuccessfully(tier);
    } catch {
      stopPolling();
      set((state) =>
        state.activeDownload?.tier === tier && state.activeDownload.phase !== "done"
          ? {
              activeDownload: {
                ...state.activeDownload,
                phase: "error",
                errorMessage: "The download couldn't finish. Check your connection and try again.",
              },
            }
          : state,
      );
    }
  }

  function ensureListeners() {
    if (listenersStarted) return;
    listenersStarted = true;

    // Re-checks the Wi-Fi gate whenever connectivity changes, regardless of
    // which screen (if any) is mounted — a download left "waiting for
    // Wi-Fi" while the user is elsewhere in the app still needs to start
    // the moment Wi-Fi connects, per AGENTS.md.
    Network.addNetworkStateListener((event) => {
      const download = get().activeDownload;
      if (!download || download.phase !== "waiting_for_wifi") return;
      if (!download.wifiOnly || event.type === Network.NetworkStateType.WIFI) {
        beginTransfer(download.tier);
      }
    });

    AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const download = get().activeDownload;
      if (!download) return;
      if (nextState === "background" && download.phase === "downloading") {
        pausedForBackgrounding = true;
        get().pauseDownload();
      } else if (nextState === "active" && download.phase === "paused" && pausedForBackgrounding) {
        pausedForBackgrounding = false;
        get().resumeDownload();
      }
    });
  }

  return {
    activeDownload: null,

    startDownload: ({ tier, origin, wifiOnly }) => {
      if (get().activeDownload) return;
      ensureListeners();
      const totalBytes = LLM_MODEL_SPECS[tier].sizeBytes;

      // Already on disk from an earlier session — finishing up is just
      // activation (checksum runs in the background separately), no network
      // call at all, so this doesn't wait on the Wi-Fi gate below.
      if (isModelDownloaded(tier)) {
        set({
          activeDownload: { tier, origin, wifiOnly, phase: "downloading", bytesWritten: totalBytes, totalBytes, errorMessage: null },
        });
        finishSuccessfully(tier);
        return;
      }

      isOnWifi().then((onWifi) => {
        const wifiGateOpen = !wifiOnly || onWifi;
        set({
          activeDownload: {
            tier,
            origin,
            wifiOnly,
            phase: wifiGateOpen ? "downloading" : "waiting_for_wifi",
            bytesWritten: 0,
            totalBytes,
            errorMessage: null,
          },
        });
        if (wifiGateOpen) beginTransfer(tier);
      });
    },

    pauseDownload: async () => {
      const task = currentTask;
      const download = get().activeDownload;
      if (!task || !download || download.phase !== "downloading") return;
      set({ activeDownload: { ...download, phase: "paused" } });
      stopPolling();
      await task.pauseAsync();
      // Re-read after the await — bytesWritten may have ticked further meanwhile.
      const latest = get().activeDownload;
      if (latest) await persistPauseState(latest);
    },

    resumeDownload: async () => {
      const download = get().activeDownload;
      const task = currentTask;
      if (!download || download.phase !== "paused") return;
      const onWifi = await isOnWifi();
      if (download.wifiOnly && !onWifi) {
        // Wi-Fi-only gating per AGENTS.md, checked before resuming too — the
        // network listener in ensureListeners() picks this back up once
        // Wi-Fi reconnects.
        set({ activeDownload: { ...download, phase: "waiting_for_wifi" } });
        return;
      }
      if (!task) return; // shouldn't happen — a "paused" download implies a reconstructed or live task
      set({ activeDownload: { ...download, phase: "downloading" } });
      startPolling(download.tier);
      try {
        const result = await task.resumeAsync();
        if (result === null) return; // paused again
        await finishSuccessfully(download.tier);
      } catch {
        stopPolling();
        const latest = get().activeDownload;
        if (latest && latest.tier === download.tier && latest.phase !== "done") {
          set({
            activeDownload: {
              ...latest,
              phase: "error",
              errorMessage: "The download couldn't finish. Check your connection and try again.",
            },
          });
        }
      }
    },

    cancelDownload: () => {
      stopPolling();
      const tier = get().activeDownload?.tier;
      currentTask?.cancel();
      currentTask = null;
      if (tier) deleteModel(tier);
      clearPersistedPauseState();
      set({ activeDownload: null });
    },

    clearDownload: () => {
      currentTask = null;
      set({ activeDownload: null });
    },

    restorePendingDownload: async () => {
      if (get().activeDownload) return; // already have one live in this session
      const raw = await AsyncStorage.getItem(PENDING_DOWNLOAD_KEY);
      if (!raw) return;
      try {
        const saved: PersistedPendingDownload = JSON.parse(raw);
        ensureListeners();
        const task = resumeModelDownloadTask(saved.pauseState, (bytesWritten) => {
          set((state) =>
            state.activeDownload?.tier === saved.tier ? { activeDownload: { ...state.activeDownload, bytesWritten } } : state,
          );
        });
        currentTask = task;
        set({
          activeDownload: {
            tier: saved.tier,
            origin: saved.origin,
            wifiOnly: saved.wifiOnly,
            phase: "paused",
            bytesWritten: saved.bytesWritten,
            totalBytes: saved.totalBytes,
            errorMessage: null,
          },
        });
        // Same as returning to the foreground after a background-triggered
        // pause — pick up right where it left off, still subject to the
        // Wi-Fi gate.
        pausedForBackgrounding = true;
        get().resumeDownload();
      } catch {
        await clearPersistedPauseState();
      }
    },
  };
});
