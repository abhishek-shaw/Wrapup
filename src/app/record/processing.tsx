import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, Text, View } from "react-native";

import { images } from "@/constants/images";
import { getMeeting, updateMeetingStatus } from "@/db/queries/meetings";
import { indexMeeting } from "@/db/queries/search";
import { upsertTranscript } from "@/db/queries/transcripts";
import { transcribeMeetingAudio, type TranscribeMeetingResult } from "@/services/asr";
import { ensureAsrModelsDownloaded } from "@/services/asr/models";
import { useRecordingStore } from "@/store/recording";
import { colors } from "@/theme";

const STEPS = ["Transcribing audio", "Writing the summary", "Finding action items"];

export default function Processing() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [currentStep, setCurrentStep] = useState(0);
  // Fraction 0-1 while the on-device ASR model is downloading (first run
  // only — every recording after that finds it already on disk). Null once
  // it's ready, so the step just reads "Transcribing audio" with no number.
  const [modelDownloadFraction, setModelDownloadFraction] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finishRecordingState = useRecordingStore((state) => state.finish);
  // Populated by the step-0 transcription effect, read by the finalize
  // effect once all steps complete — avoids threading the result through
  // state just to hand it to the next effect.
  const transcriptRef = useRef<TranscribeMeetingResult | null>(null);

  useEffect(() => {
    if (currentStep >= STEPS.length) {
      let isMounted = true;
      const finish = async () => {
        try {
          const meeting = await getMeeting(id);
          const transcript = transcriptRef.current;
          // TODO: Replace with real llama.rn-generated content once
          // summarization/action-item extraction is implemented.
          const summaryText = "";

          if (meeting) {
            if (transcript) {
              await upsertTranscript({
                meetingId: id,
                text: transcript.text,
                segments: transcript.segments,
                language: transcript.language,
              });
            }
            await indexMeeting({
              meetingId: id,
              title: meeting.title,
              summaryText,
              transcriptText: transcript?.text ?? "",
            });
          }
          // Only update to "ready" after indexing completes successfully
          await updateMeetingStatus(id, "ready");
          finishRecordingState();
          if (isMounted) {
            router.replace(`/meeting/${id}`);
          }
        } catch {
          await updateMeetingStatus(id, "failed").catch(() => {});
          finishRecordingState();
          if (isMounted) {
            setError("Failed to process meeting");
          }
        }
      };
      // Note: intentionally not clearing this timeout on unmount — the
      // finalize step (persist + index + mark ready) must run even if the
      // user navigates away before it fires.
      setTimeout(finish, 500);
      return () => {
        isMounted = false;
      };
    }

    if (currentStep === 0) {
      let isMounted = true;
      const transcribe = async () => {
        try {
          const meeting = await getMeeting(id);
          if (!meeting?.audioFilePath) {
            throw new Error("Recording has no audio file");
          }
          await ensureAsrModelsDownloaded((progress) => {
            if (isMounted) setModelDownloadFraction(progress.fraction < 1 ? progress.fraction : null);
          });
          if (isMounted) setModelDownloadFraction(null);

          transcriptRef.current = await transcribeMeetingAudio(meeting.audioFilePath);
          if (isMounted) setCurrentStep((prev) => prev + 1);
        } catch (err) {
          // Local-only debug log (no transcript/audio content involved) —
          // see AGENTS.md Privacy & Network Rules.
          console.error("[ASR] transcription failed:", err);
          if (isMounted) setError("Failed to transcribe the recording");
        }
      };
      transcribe();
      return () => {
        isMounted = false;
      };
    }

    // Steps beyond transcription aren't implemented yet (summarization needs
    // llama.rn — see AGENTS.md) — kept as a placeholder animation so the
    // screen's pacing doesn't change once those steps do real work.
    const timeout = setTimeout(() => setCurrentStep((prev) => prev + 1), 1500);
    return () => clearTimeout(timeout);
  }, [currentStep, id, router, finishRecordingState]);

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
        <View className="flex-1 items-center justify-center gap-6 px-8">
          <Image source={images.mascotLogo} style={{ width: 96, height: 96 }} contentFit="contain" />
          <View className="items-center gap-2">
            <Text className="text-center text-h1 text-white">Processing failed</Text>
            <Text className="text-center text-body-lg text-ink-secondary">{error}</Text>
          </View>
          <Pressable
            onPress={() => {
              setError(null);
              setCurrentStep(0);
            }}
            className="h-12 items-center justify-center rounded-2xl bg-amber px-6 active:opacity-80"
          >
            <Text className="text-h3 text-mascot-features">Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 items-center justify-center gap-8 px-8">
        <Image source={images.mascotLogo} style={{ width: 96, height: 96 }} contentFit="contain" />

        <View className="items-center gap-2">
          <Text className="text-center text-h1 text-white">Making sense of it all</Text>
          <Text className="text-center text-body-lg text-ink-secondary">
            {modelDownloadFraction !== null
              ? "Getting the on-device transcription model ready — a one-time step."
              : "Transcribing and summarizing on this device. This can take a minute for longer meetings."}
          </Text>
        </View>

        <View className="w-full gap-4">
          {STEPS.map((step, index) => {
            const state = index < currentStep ? "done" : index === currentStep ? "active" : "pending";
            return (
              <View key={step} className="flex-row items-center gap-3">
                <View
                  className={`h-7 w-7 items-center justify-center rounded-full ${
                    state === "done" ? "bg-amber" : "border-2 border-white/20"
                  }`}
                >
                  {state === "done" ? (
                    <Ionicons name="checkmark" size={16} color={colors.mascot.features} />
                  ) : state === "active" ? (
                    <ActivityIndicator size="small" color={colors.primary.amber} />
                  ) : null}
                </View>
                <Text className={`text-body-lg ${state === "pending" ? "text-ink-secondary" : "text-white"}`}>
                  {step}
                  {state === "active" && index === 0 && modelDownloadFraction !== null
                    ? ` · ${Math.round(modelDownloadFraction * 100)}%`
                    : ""}
                </Text>
              </View>
            );
          })}
        </View>

        <Text className="text-center text-caption text-ink-secondary">
          You can leave this screen — we&apos;ll notify you when it&apos;s ready
        </Text>
      </View>
    </SafeAreaView>
  );
}
