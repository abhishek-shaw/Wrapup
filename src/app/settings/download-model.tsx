import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Network from "expo-network";
import type { DownloadTask } from "expo-file-system";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, SafeAreaView, Text, View } from "react-native";

import { images } from "@/constants/images";
import {
  LLM_MODEL_SPECS,
  createModelDownloadTask,
  deleteModel,
  isModelDownloaded,
  verifyDownloadedModel,
} from "@/services/llm/models";
import { useSettingsStore } from "@/store/settings";
import { colors } from "@/theme";
import type { ModelTier } from "@/types/models";

const MODEL_NAMES: Record<ModelTier, string> = {
  fast: "Fast",
  balanced: "Balanced",
  best_quality: "Best quality",
};

type Phase = "waiting_for_wifi" | "downloading" | "paused" | "verifying" | "done" | "error";
type Origin = "onboarding" | "settings";

export default function DownloadModel() {
  const router = useRouter();
  const { tier: tierParam, wifiOnly, origin: originParam } = useLocalSearchParams<{
    tier?: ModelTier;
    wifiOnly?: string;
    origin?: Origin;
  }>();
  const tier: ModelTier = tierParam ?? "balanced";
  const origin: Origin = originParam === "onboarding" ? "onboarding" : "settings";
  const isWifiOnly = wifiOnly !== "false";
  const setActiveModelTier = useSettingsStore((state) => state.setActiveModelTier);

  const networkState = Network.useNetworkState();
  const isOnWifi = networkState.type === Network.NetworkStateType.WIFI;
  const wifiGateOpen = !isWifiOnly || isOnWifi;

  const [phase, setPhase] = useState<Phase>(wifiGateOpen ? "downloading" : "waiting_for_wifi");
  const [bytesWritten, setBytesWritten] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const taskRef = useRef<DownloadTask | null>(null);
  const startedRef = useRef(false);
  const finalizedRef = useRef(false);
  const cancelledRef = useRef(false);

  const spec = LLM_MODEL_SPECS[tier];
  const modelName = MODEL_NAMES[tier];
  const totalBytes = spec.sizeBytes;

  const finalize = async () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    setPhase("verifying");
    setBytesWritten(0);
    const verified = await verifyDownloadedModel(tier, (fraction) => setBytesWritten(Math.round(fraction * totalBytes)));
    if (!verified) {
      finalizedRef.current = false;
      setErrorMessage("The downloaded file didn't match what we expected. Please try again.");
      setPhase("error");
      return;
    }
    await setActiveModelTier(tier);
    setPhase("done");
    // Onboarding already marks itself complete when the user reaches
    // choose-model (see that screen), so this is purely about where to land.
    setTimeout(() => {
      router.replace(origin === "onboarding" ? "/today" : "/settings");
    }, 900);
  };

  const startDownload = async () => {
    // Already on disk from an earlier session — finishing up is just a
    // checksum + activation, no network call at all, so this runs
    // regardless of the Wi-Fi gate below (see the mount effect).
    if (isModelDownloaded(tier)) {
      await finalize();
      return;
    }
    try {
      setPhase("downloading");
      setErrorMessage(null);
      const task = createModelDownloadTask(tier, (written) => setBytesWritten(written));
      taskRef.current = task;
      const result = await task.downloadAsync();
      if (result === null) {
        // Paused mid-transfer — pauseAsync()/resumeAsync() below drive the rest.
        return;
      }
      await finalize();
    } catch {
      if (!finalizedRef.current && !cancelledRef.current) {
        setErrorMessage("The download couldn't finish. Check your connection and try again.");
        setPhase("error");
      }
    }
  };

  // Picks up an already-downloaded file the instant this screen mounts,
  // independent of Wi-Fi state — gating that on the network gate would
  // strand a user who already has the model on a "Waiting for Wi-Fi"
  // screen for no reason, since finishing up needs no network call.
  useEffect(() => {
    if (startedRef.current || !isModelDownloaded(tier)) return;
    startedRef.current = true;
    startDownload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier]);

  // Gates the *start* of an actual network download, per AGENTS.md ("checked
  // before starting or resuming") — re-runs once wifiGateOpen flips true
  // (Wi-Fi connects), and startedRef prevents it from firing again after
  // that (including if the effect above already handled an already-downloaded
  // file). Resuming after a pause has its own gate check in handlePauseResume.
  useEffect(() => {
    if (!wifiGateOpen || startedRef.current) return;
    startedRef.current = true;
    startDownload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wifiGateOpen]);

  // Independent safety net for a `DownloadTask` bug observed after a
  // pause→resume→complete cycle: the underlying network transfer finishes
  // (confirmed via OS-level logs and the file landing on disk at the exact
  // expected size), but the `resumeAsync()`/`downloadAsync()` promise never
  // resolves, leaving the UI stuck at 100% forever with no way out. Rather
  // than trust progress events (which is what left this stuck in the first
  // place), poll the filesystem directly while a download is in flight —
  // this catches completion regardless of whether the native promise or
  // progress callback ever fires again.
  useEffect(() => {
    if (phase !== "downloading") return;
    const interval = setInterval(() => {
      if (!finalizedRef.current && isModelDownloaded(tier)) {
        finalize();
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, tier]);

  const handlePauseResume = async () => {
    const task = taskRef.current;
    if (!task) return;
    if (phase === "downloading") {
      setPhase("paused");
      await task.pauseAsync();
    } else if (phase === "paused") {
      if (isWifiOnly && !isOnWifi) return; // gate resume on Wi-Fi too, per AGENTS.md
      setPhase("downloading");
      try {
        const result = await task.resumeAsync();
        if (result === null) return; // paused again
        await finalize();
      } catch {
        if (!finalizedRef.current && !cancelledRef.current) {
          setErrorMessage("The download couldn't finish. Check your connection and try again.");
          setPhase("error");
        }
      }
    }
  };

  const handleCancel = () => {
    Alert.alert("Cancel download?", "Progress so far will be lost — you can start again anytime.", [
      { text: "Keep downloading", style: "cancel" },
      {
        text: "Cancel download",
        style: "destructive",
        onPress: () => {
          cancelledRef.current = true;
          taskRef.current?.cancel();
          deleteModel(tier);
          router.back();
        },
      },
    ]);
  };

  const handleRetry = () => {
    setErrorMessage(null);
    startedRef.current = false;
    setBytesWritten(0);
    if (wifiGateOpen) {
      startedRef.current = true;
      startDownload();
    } else {
      setPhase("waiting_for_wifi");
    }
  };

  const totalGb = (totalBytes / 1e9).toFixed(2);
  const downloadedGb = (bytesWritten / 1e9).toFixed(2);
  const progressPercent = totalBytes > 0 ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100)) : 0;
  const done = phase === "done";

  const statusText =
    phase === "waiting_for_wifi"
      ? "Waiting for Wi-Fi — connect to Wi-Fi to continue, or turn off Wi-Fi-only on the previous screen."
      : phase === "verifying"
        ? "Verifying the download…"
        : phase === "error"
          ? (errorMessage ?? "Something went wrong.")
          : done
            ? `${modelName} downloaded successfully. You're all set.`
            : `${downloadedGb} GB of ${totalGb} GB`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 items-center justify-center gap-8 px-8">
        {done ? (
          <View className="h-24 w-24 items-center justify-center rounded-full bg-success/20">
            <Ionicons name="checkmark" size={48} color={colors.semantic.success} />
          </View>
        ) : (
          <Image source={images.mascotLogo} style={{ width: 96, height: 96 }} contentFit="contain" />
        )}

        <View className="items-center gap-2">
          <Text className="text-center text-h1 text-white">
            {done
              ? `${modelName} model ready`
              : phase === "verifying"
                ? `Verifying ${modelName} model`
                : phase === "error"
                  ? "Download failed"
                  : `Downloading ${modelName} model`}
          </Text>
          <Text className="text-center text-body-lg text-ink-secondary">{statusText}</Text>
        </View>

        <View className="w-full gap-2">
          <View className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <View
              className={`h-2 rounded-full ${phase === "error" ? "bg-error" : "bg-amber"}`}
              style={{ width: `${phase === "waiting_for_wifi" ? 0 : progressPercent}%` }}
            />
          </View>
          <Text className="text-center text-body-md text-ink-secondary">
            {phase === "waiting_for_wifi" ? "" : `${progressPercent}%`}
          </Text>
        </View>

        <View className="w-full flex-row items-start gap-3 rounded-2xl bg-ink-surface p-4">
          <Ionicons name="information-circle-outline" size={20} color={colors.ink.textSecondary} />
          <Text className="flex-1 text-body-md text-ink-secondary">
            You can keep using the app while this downloads. Recording works now — summaries will be ready
            once this finishes.
          </Text>
        </View>

        <View className="w-full gap-3">
          {phase === "error" ? (
            <Pressable
              onPress={handleRetry}
              className="h-12 items-center justify-center rounded-2xl bg-amber active:opacity-80"
            >
              <Text className="text-h3 text-mascot-features">Retry</Text>
            </Pressable>
          ) : phase === "downloading" || phase === "paused" || phase === "waiting_for_wifi" ? (
            <>
              {phase !== "waiting_for_wifi" ? (
                <Pressable
                  onPress={handlePauseResume}
                  className="h-12 items-center justify-center rounded-2xl border border-white/20 active:opacity-70"
                >
                  <Text className="text-h3 text-white">
                    {phase === "paused" ? "Resume download" : "Pause download"}
                  </Text>
                </Pressable>
              ) : null}
              <Text className="text-center text-caption text-ink-secondary">
                {phase === "paused" ? "Download paused" : isWifiOnly ? "Downloading over Wi-Fi" : "Downloading"}
              </Text>
              <Pressable onPress={handleCancel} className="items-center py-1 active:opacity-70">
                <Text className="text-center text-body-sm text-error">Cancel download</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
