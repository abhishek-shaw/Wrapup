import { useRouter, usePathname } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { getCaptureStatus } from "@/services/recording";
import { useRecordingStore } from "@/store/recording";
import { formatDuration } from "@/lib/format-duration";

type RecordingIndicatorPhase = "recording" | "paused" | "processing";

type RecordingIndicatorProps = {
  phase: RecordingIndicatorPhase;
  label: string;
  onPress?: () => void;
};

// Full literal class names (not built from interpolated fragments) so
// NativeWind's static scanner can see every class this component can render.
const PHASE_DOT_CLASSES: Record<RecordingIndicatorPhase, string> = {
  recording: "bg-error",
  paused: "bg-warning",
  processing: "bg-amber",
};
const PHASE_TEXT_CLASSES: Record<RecordingIndicatorPhase, string> = {
  recording: "text-error",
  paused: "text-warning",
  processing: "text-amber",
};

/** The pill itself — a recording/paused/processing badge. Used inline on the
 * progress screen and, floating, as the app-wide persistent indicator below.
 * Per AGENTS.md this state must always be visually unambiguous, so phase
 * always drives both the dot color and the label text together. */
export function RecordingIndicator({ phase, label, onPress }: RecordingIndicatorProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center gap-2 rounded-full px-4 py-2 active:opacity-80"
      style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
    >
      <View className={`h-2 w-2 rounded-full ${PHASE_DOT_CLASSES[phase]}`} />
      <Text className={`text-body-md ${PHASE_TEXT_CLASSES[phase]}`}>{label}</Text>
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
  const isPaused = useRecordingStore((state) => state.isPaused);
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
    <RecordingIndicator
      phase={recordingState === "recording" ? (isPaused ? "paused" : "recording") : "processing"}
      label={
        recordingState === "recording"
          ? `${isPaused ? "Paused" : "Recording"} · ${formatDuration(elapsedSeconds)}`
          : "Processing…"
      }
      onPress={() =>
        router.push(
          recordingState === "recording"
            ? `/record/progress?id=${activeMeetingId}`
            : `/record/processing?id=${activeMeetingId}`,
        )
      }
    />
  );
}
