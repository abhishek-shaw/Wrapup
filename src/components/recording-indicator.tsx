import { useRouter, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, SafeAreaView, Text, View } from "react-native";

import { getCaptureStatus } from "@/services/recording";
import { useRecordingStore } from "@/store/recording";
import { formatDuration } from "@/lib/format-duration";

type RecordingIndicatorProps = {
  phase: "recording" | "processing";
  label: string;
  onPress?: () => void;
};

/** The pill itself — a recording/processing badge. Used inline on the progress
 * screen and, floating, as the app-wide persistent indicator below. Per
 * AGENTS.md this state must always be visually unambiguous, so phase always
 * drives both the dot color and the label text together. */
export function RecordingIndicator({ phase, label, onPress }: RecordingIndicatorProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center gap-2 rounded-full px-4 py-2 active:opacity-80"
      style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
    >
      <View className={`h-2 w-2 rounded-full ${phase === "recording" ? "bg-error" : "bg-amber"}`} />
      <Text className={`text-body-md ${phase === "recording" ? "text-error" : "text-amber"}`}>{label}</Text>
    </Pressable>
  );
}

/** Floats above whatever screen the user is on while a meeting is being
 * captured or processed, so navigating away from the record flow never
 * hides that recording is still happening. Hidden on the record/* screens
 * themselves since they already show the full recording UI. */
export function PersistentRecordingBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const recordingState = useRecordingStore((state) => state.recordingState);
  const activeMeetingId = useRecordingStore((state) => state.activeMeetingId);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (recordingState !== "recording") return;
    const tick = () => {
      const status = getCaptureStatus();
      setElapsedSeconds(status ? Math.floor(status.durationMillis / 1000) : 0);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [recordingState]);

  if (recordingState === "idle" || !activeMeetingId) return null;
  if (pathname.startsWith("/record")) return null;

  return (
    <SafeAreaView
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0 }}
    >
      <View
        className="items-center"
        style={{ paddingTop: Platform.OS === "android" ? 16 : 8 }}
      >
        <RecordingIndicator
          phase={recordingState === "recording" ? "recording" : "processing"}
          label={
            recordingState === "recording" ? `Recording · ${formatDuration(elapsedSeconds)}` : "Processing…"
          }
          onPress={() =>
            router.push(
              recordingState === "recording"
                ? `/record/progress?id=${activeMeetingId}`
                : `/record/processing?id=${activeMeetingId}`,
            )
          }
        />
      </View>
    </SafeAreaView>
  );
}
