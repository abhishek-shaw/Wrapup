import { useRouter, usePathname } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { LLM_MODEL_SPECS } from "@/services/llm/models";
import { useModelDownloadStore } from "@/store/modelDownload";

const PHASE_DOT_CLASSES = {
  waiting_for_wifi: "bg-warning",
  downloading: "bg-amber",
  paused: "bg-warning",
  error: "bg-error",
} as const;
const PHASE_TEXT_CLASSES = {
  waiting_for_wifi: "text-warning",
  downloading: "text-amber",
  paused: "text-warning",
  error: "text-error",
} as const;

/** Floats above whatever screen the user is on while a model download is in
 * flight — same reasoning as PersistentRecordingBanner: leaving
 * download-model.tsx must not make it look like the download stopped.
 * Hidden on that screen itself (already shows full detail) and once the
 * download reaches "done" (a brief success state the screen shows before
 * auto-navigating away). */
export function PersistentModelDownloadBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const activeDownload = useModelDownloadStore((state) => state.activeDownload);

  if (!activeDownload || activeDownload.phase === "done") return null;
  if (pathname.startsWith("/settings/download-model")) return null;

  const modelName = LLM_MODEL_SPECS[activeDownload.tier].label;
  const percent =
    activeDownload.totalBytes > 0 ? Math.round((activeDownload.bytesWritten / activeDownload.totalBytes) * 100) : 0;
  const label =
    activeDownload.phase === "waiting_for_wifi"
      ? `${modelName} model · waiting for Wi-Fi`
      : activeDownload.phase === "paused"
        ? `${modelName} model paused · ${percent}%`
        : activeDownload.phase === "error"
          ? `${modelName} model download failed`
          : `Downloading ${modelName} model · ${percent}%`;

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/settings/download-model",
          params: {
            tier: activeDownload.tier,
            wifiOnly: activeDownload.wifiOnly.toString(),
            origin: activeDownload.origin,
          },
        })
      }
      className="flex-row items-center gap-2 rounded-full px-4 py-2 active:opacity-80"
      style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
    >
      <View className={`h-2 w-2 rounded-full ${PHASE_DOT_CLASSES[activeDownload.phase]}`} />
      <Text className={`text-body-md ${PHASE_TEXT_CLASSES[activeDownload.phase]}`}>{label}</Text>
    </Pressable>
  );
}
