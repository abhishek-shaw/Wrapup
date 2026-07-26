import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

import { RecordingIndicator } from "@/components/recording-indicator";
import { finishRecording, updateMeetingStatus } from "@/db/queries/meetings";
import { formatDuration } from "@/lib/format-duration";
import { getCaptureStatus, stopCapture } from "@/services/recording";
import { useRecordingStore } from "@/store/recording";
import { colors } from "@/theme";

const BAR_COUNT = 7;
const MIN_BAR_HEIGHT = 8;
const MAX_BAR_HEIGHT = 44;

/** Maps a metering reading (dBFS, roughly -60 silence to 0 max) to a bar height in px. */
function meteringToHeight(dB: number | null | undefined): number {
  if (dB == null || Number.isNaN(dB)) return MIN_BAR_HEIGHT;
  const clamped = Math.max(-60, Math.min(0, dB));
  const normalized = (clamped + 60) / 60;
  return Math.round(MIN_BAR_HEIGHT + normalized * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT));
}

export default function RecordingProgress() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeMeetingTitle = useRecordingStore((state) => state.activeMeetingTitle);
  const markProcessing = useRecordingStore((state) => state.markProcessing);
  const [seconds, setSeconds] = useState(0);
  const [barHeights, setBarHeights] = useState<number[]>(Array(BAR_COUNT).fill(MIN_BAR_HEIGHT));
  const [stopping, setStopping] = useState(false);
  // Set the moment stopCapture() succeeds, so a retry after a failed
  // finishRecording/updateMeetingStatus never calls stopCapture() again —
  // the native recorder is already released by then and a second call
  // would just throw "No recording in progress".
  const [captureResult, setCaptureResult] = useState<{ audioFilePath: string; durationSeconds: number } | null>(
    null,
  );

  // Poll the native recorder rather than a local timer, since capture keeps
  // running (and its true duration keeps advancing) even if this screen was
  // unmounted and remounted after the user navigated away and back.
  useEffect(() => {
    const interval = setInterval(() => {
      const status = getCaptureStatus();
      if (!status) return;
      setSeconds(Math.floor(status.durationMillis / 1000));
      setBarHeights((prev) => [...prev.slice(1), meteringToHeight(status.metering)]);
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const stopRecording = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      const result = captureResult ?? (await stopCapture());
      if (!captureResult) setCaptureResult(result);

      await finishRecording(id, {
        audioFilePath: result.audioFilePath,
        endedAt: new Date().toISOString(),
        durationSeconds: result.durationSeconds,
      });
      await updateMeetingStatus(id, "processing");
      markProcessing();
      router.replace(`/record/processing?id=${id}`);
    } catch {
      setStopping(false);
      // surface error to user here
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 items-center justify-between px-8 py-10">
        <RecordingIndicator phase="recording" label="Recording" />

        <View className="items-center gap-6">
          <View className="items-center gap-1">
            <Text className="text-display text-white">{formatDuration(seconds)}</Text>
            <Text className="text-body-lg text-ink-secondary">{activeMeetingTitle ?? "New recording"}</Text>
          </View>

          <View className="h-16 flex-row items-end gap-2">
            {barHeights.map((height, index) => (
              <View key={index} className="w-1.5 rounded-full bg-amber" style={{ height }} />
            ))}
          </View>

          <Text className="text-center text-body-md text-ink-secondary">
            Processing happens on this device once you stop
          </Text>
        </View>

        <Pressable
          onPress={stopRecording}
          disabled={stopping}
          className="h-20 w-20 items-center justify-center rounded-full bg-coral active:opacity-80 disabled:opacity-60"
        >
          <View className="h-6 w-6 rounded bg-white" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
