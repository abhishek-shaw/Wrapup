import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Alert, Pressable, SafeAreaView, Text, View } from "react-native";

import { RecordingIndicator } from "@/components/recording-indicator";
import { WaveformBars } from "@/components/waveform-bars";
import { deleteMeeting, finishRecording, updateMeetingStatus } from "@/db/queries/meetings";
import { formatDuration } from "@/lib/format-duration";
import { deleteAudioFile, getCaptureStatus, pauseCapture, resumeCapture, stopCapture } from "@/services/recording";
import { useRecordingStore } from "@/store/recording";
import { colors } from "@/theme";

const BAR_COUNT = 32;
const BAR_HEIGHT = 56;
const BAR_BASELINE = 0.08; // minimum bar height fraction — matches MeetingAudioPlayer's silence floor

/** Maps a metering reading (dBFS, roughly -60 silence to 0 max) to a normalized
 * 0-1 bar value — same linear mapping MeetingAudioPlayer's waveform uses, just
 * kept as a fraction here instead of a pixel height since WaveformBars owns
 * the animation/rendering. */
function meteringToNormalized(dB: number | null | undefined): number {
  if (dB == null || Number.isNaN(dB)) return BAR_BASELINE;
  const clamped = Math.max(-60, Math.min(0, dB));
  const normalized = (clamped + 60) / 60;
  return BAR_BASELINE + normalized * (1 - BAR_BASELINE);
}

// --- Background-noise indicator --------------------------------------------
// We only have overall mic volume (dBFS) here, not real speech/noise
// separation, so this is a volume-based proxy rather than true noise
// detection: real conversation has natural pauses, so audio that stays loud
// almost continuously over the last few seconds is more likely a noisy room
// (fan, traffic, AC) than speech. Good enough to warn the user, not a
// lab-grade measurement.
const NOISE_WINDOW_SIZE = 25; // ~5s at the 200ms poll interval below
const QUIET_DB_THRESHOLD = -35; // dBFS below this reads as near-silence
const MIN_SAMPLES_FOR_QUALITY = 10; // ~2s — avoid judging quality on a sliver of audio

type AudioQuality = "good" | "moderate" | "poor";

function classifyAudioQuality(samples: number[]): AudioQuality | null {
  if (samples.length < MIN_SAMPLES_FOR_QUALITY) return null;
  const nonQuietFraction = samples.filter((dB) => dB > QUIET_DB_THRESHOLD).length / samples.length;
  if (nonQuietFraction < 0.6) return "good";
  if (nonQuietFraction < 0.85) return "moderate";
  return "poor";
}

const QUALITY_LABELS: Record<AudioQuality, string> = {
  good: "Good audio quality",
  moderate: "Some background noise",
  poor: "Loud background noise — may affect transcription",
};
const QUALITY_BG_CLASSES: Record<AudioQuality, string> = {
  good: "bg-success/20",
  moderate: "bg-warning/20",
  poor: "bg-error/20",
};
const QUALITY_TEXT_CLASSES: Record<AudioQuality, string> = {
  good: "text-success",
  moderate: "text-warning",
  poor: "text-error",
};
const QUALITY_DOT_CLASSES: Record<AudioQuality, string> = {
  good: "bg-success",
  moderate: "bg-warning",
  poor: "bg-error",
};

export default function RecordingProgress() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activeMeetingTitle = useRecordingStore((state) => state.activeMeetingTitle);
  const isPaused = useRecordingStore((state) => state.isPaused);
  const pauseStore = useRecordingStore((state) => state.pause);
  const resumeStore = useRecordingStore((state) => state.resume);
  const markProcessing = useRecordingStore((state) => state.markProcessing);
  const finishRecordingState = useRecordingStore((state) => state.finish);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(Array(BAR_COUNT).fill(BAR_BASELINE));
  const [audioQuality, setAudioQuality] = useState<AudioQuality | null>(null);
  const [stopping, setStopping] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const noiseSamplesRef = useRef<number[]>([]);
  // Set the moment stopCapture() succeeds, so a retry after a failed
  // finishRecording/updateMeetingStatus (or a later discard) never calls
  // stopCapture() again — the native recorder is already released by then
  // and a second call would just throw "No recording in progress".
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

      // Don't feed a paused stretch into the bar/noise windows — it would
      // read as silence and skew the audio-quality reading downward.
      if (isPaused) return;
      setLevels((prev) => [...prev.slice(1), meteringToNormalized(status.metering)]);
      const dB = status.metering ?? -60;
      noiseSamplesRef.current = [...noiseSamplesRef.current.slice(-(NOISE_WINDOW_SIZE - 1)), dB];
      setAudioQuality(classifyAudioQuality(noiseSamplesRef.current));
    }, 200);
    return () => clearInterval(interval);
  }, [isPaused]);

  const handleTogglePause = () => {
    if (isPaused) {
      resumeCapture();
      resumeStore();
    } else {
      pauseCapture();
      pauseStore();
    }
  };

  const stopRecording = async () => {
    if (stopping || discarding) return;
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

  const handleDiscard = () => {
    Alert.alert("Discard this recording?", "The recording will be deleted and won't be transcribed.", [
      { text: "Keep recording", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          if (stopping || discarding) return;
          setDiscarding(true);
          try {
            const result = captureResult ?? (await stopCapture());
            if (!captureResult) setCaptureResult(result);
            deleteAudioFile(result.audioFilePath);
            await deleteMeeting(id);
          } catch {
            // best-effort cleanup — still leave the recording session below
            // even if a step here failed, rather than trapping the user here
          } finally {
            finishRecordingState();
            router.back();
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 items-center justify-between px-8 py-10">
        <RecordingIndicator phase={isPaused ? "paused" : "recording"} label={isPaused ? "Paused" : "Recording"} />

        <View className="w-full items-center gap-6">
          <View className="items-center gap-1">
            <Text className="text-display text-white">{formatDuration(seconds)}</Text>
            <Text className="text-body-lg text-ink-secondary">{activeMeetingTitle ?? "New recording"}</Text>
          </View>

          <View className="w-full">
            <WaveformBars
              values={levels}
              activeCount={levels.length}
              height={BAR_HEIGHT}
              activeColor={colors.primary.amber}
              inactiveColor={colors.primary.amber}
            />
          </View>

          {audioQuality ? (
            <View
              className={`flex-row items-center gap-2 rounded-full px-3 py-1.5 ${QUALITY_BG_CLASSES[audioQuality]}`}
            >
              <View className={`h-2 w-2 rounded-full ${QUALITY_DOT_CLASSES[audioQuality]}`} />
              <Text className={`text-caption ${QUALITY_TEXT_CLASSES[audioQuality]}`}>
                {QUALITY_LABELS[audioQuality]}
              </Text>
            </View>
          ) : null}

          <Text className="text-center text-body-md text-ink-secondary">
            Recording stays on this device. End the meeting to start processing.
          </Text>
        </View>

        <View className="w-full flex-row items-end justify-between px-2">
          <View className="items-center gap-2">
            <Pressable
              onPress={handleDiscard}
              disabled={stopping || discarding}
              className="h-14 w-14 items-center justify-center rounded-full border border-white/20 active:opacity-70 disabled:opacity-50"
            >
              <Ionicons name="trash-outline" size={22} color={colors.semantic.error} />
            </Pressable>
            <Text className="text-caption text-ink-secondary">{discarding ? "Discarding…" : "Discard"}</Text>
          </View>

          <View className="items-center gap-2">
            <Pressable
              onPress={stopRecording}
              disabled={stopping || discarding}
              className="h-20 w-20 items-center justify-center rounded-full bg-coral active:opacity-80 disabled:opacity-60"
            >
              <View className="h-6 w-6 rounded bg-white" />
            </Pressable>
            <Text className="text-body-md font-semibold text-white">{stopping ? "Ending…" : "End meeting"}</Text>
          </View>

          <View className="items-center gap-2">
            <Pressable
              onPress={handleTogglePause}
              disabled={stopping || discarding}
              className="h-14 w-14 items-center justify-center rounded-full border border-white/20 active:opacity-70 disabled:opacity-50"
            >
              <Ionicons name={isPaused ? "play" : "pause"} size={22} color={colors.primary.amber} />
            </Pressable>
            <Text className="text-caption text-ink-secondary">{isPaused ? "Resume" : "Pause"}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
