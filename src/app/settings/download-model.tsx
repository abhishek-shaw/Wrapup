import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { images } from "@/constants/images";
import { getTotalDownloadedSizeBytes, isModelDownloaded, LLM_MODEL_SPECS } from "@/services/llm/models";
import { useModelDownloadStore } from "@/store/modelDownload";
import { colors } from "@/theme";
import type { ModelTier } from "@/types/models";

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

  const activeDownload = useModelDownloadStore((state) => state.activeDownload);
  const startDownload = useModelDownloadStore((state) => state.startDownload);
  const pauseDownload = useModelDownloadStore((state) => state.pauseDownload);
  const resumeDownload = useModelDownloadStore((state) => state.resumeDownload);
  const cancelDownload = useModelDownloadStore((state) => state.cancelDownload);
  const clearDownload = useModelDownloadStore((state) => state.clearDownload);

  const spec = LLM_MODEL_SPECS[tier];
  const modelName = spec.label;
  const totalBytes = spec.sizeBytes;

  // Only relevant for an actual new download — not when re-verifying a file
  // that's already on disk, and not while a download (possibly this very
  // tier, e.g. restored after an app relaunch) is already in progress. Warns
  // before adding a second/third model rather than before every download.
  const alreadyDownloadedBytes = getTotalDownloadedSizeBytes();
  const needsStorageConfirmation = !activeDownload && alreadyDownloadedBytes > 0 && !isModelDownloaded(tier);

  // Kicks the download off once, on mount, unless it's already in progress
  // (reached via the persistent banner, or restored from a previous
  // session) or still waiting on the storage-confirmation tap below.
  useEffect(() => {
    if (activeDownload || needsStorageConfirmation) return;
    startDownload({ tier, origin, wifiOnly: isWifiOnly });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = activeDownload?.phase === "done";
  useEffect(() => {
    if (!done) return;
    // Onboarding already marks itself complete when the user reaches
    // choose-model (see that screen), so this is purely about where to land.
    const timeout = setTimeout(() => {
      router.replace(origin === "onboarding" ? "/today" : "/settings");
    }, 900);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const handleConfirmStorage = () => startDownload({ tier, origin, wifiOnly: isWifiOnly });

  // startDownload() no-ops while activeDownload still exists, so a retry
  // after an error has to clear the stale ("error") entry first.
  const handleRetry = () => {
    clearDownload();
    startDownload({ tier, origin, wifiOnly: isWifiOnly });
  };

  const handlePauseResume = () => {
    if (activeDownload?.phase === "downloading") {
      pauseDownload();
    } else if (activeDownload?.phase === "paused") {
      resumeDownload();
    }
  };

  const handleCancel = () => {
    Alert.alert("Cancel download?", "Progress so far will be lost — you can start again anytime.", [
      { text: "Keep downloading", style: "cancel" },
      {
        text: "Cancel download",
        style: "destructive",
        onPress: () => {
          cancelDownload();
          router.back();
        },
      },
    ]);
  };

  // Leaving is safe now — progress lives in the store regardless of whether
  // this screen is mounted, and PersistentModelDownloadBanner keeps showing
  // status from anywhere else in the app. Only "done"/"error" need clearing
  // so a later visit to this screen (or the banner) doesn't show stale state.
  const handleBack = () => {
    if (activeDownload?.phase === "done" || activeDownload?.phase === "error") {
      clearDownload();
    }
    router.back();
  };

  if (needsStorageConfirmation) {
    const alreadyDownloadedGb = (alreadyDownloadedBytes / 1e9).toFixed(2);
    const combinedGb = ((alreadyDownloadedBytes + totalBytes) / 1e9).toFixed(2);
    const totalGb = (totalBytes / 1e9).toFixed(2);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
        <View className="flex-1 items-center justify-center gap-8 px-8">
          <Image source={images.mascotLogo} style={{ width: 96, height: 96 }} contentFit="contain" />
          <View className="items-center gap-2">
            <Text className="text-center text-h1 text-white">Download {modelName} model?</Text>
            <Text className="text-center text-body-lg text-ink-secondary">
              You already have {alreadyDownloadedGb} GB of on-device models downloaded. Adding {modelName} ({totalGb}{" "}
              GB) brings your total to {combinedGb} GB.
            </Text>
          </View>
          <View className="w-full gap-3">
            <Pressable
              onPress={handleConfirmStorage}
              className="h-14 items-center justify-center rounded-2xl bg-amber active:opacity-80"
            >
              <Text className="text-h3 text-mascot-features">Continue download</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} className="items-center py-1 active:opacity-70">
              <Text className="text-center text-body-sm text-ink-secondary">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (!activeDownload) return null; // brief window while startDownload's Wi-Fi check resolves

  const { phase, bytesWritten, errorMessage } = activeDownload;
  const downloadTotalBytes = activeDownload.totalBytes;
  const totalGb = (downloadTotalBytes / 1e9).toFixed(2);
  const downloadedGb = (bytesWritten / 1e9).toFixed(2);
  const progressPercent =
    downloadTotalBytes > 0 ? Math.min(100, Math.round((bytesWritten / downloadTotalBytes) * 100)) : 0;

  const statusText =
    phase === "waiting_for_wifi"
      ? "Waiting for Wi-Fi — connect to Wi-Fi to continue, or turn off Wi-Fi-only on the previous screen."
      : phase === "error"
        ? (errorMessage ?? "Something went wrong.")
        : done
          ? `${modelName} downloaded successfully. You're all set.`
          : `${downloadedGb} GB of ${totalGb} GB`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-row items-center px-5 pt-4">
        <Pressable onPress={handleBack} className="h-8 w-8 items-center justify-center">
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

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
            You can keep using the app while this downloads — tap back anytime, we&apos;ll keep you posted.
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
                {phase === "paused" ? "Download paused" : activeDownload.wifiOnly ? "Downloading over Wi-Fi" : "Downloading"}
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
