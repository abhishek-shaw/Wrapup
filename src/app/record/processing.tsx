import { Ionicons } from "@expo/vector-icons";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, Text, View } from "react-native";

import { images } from "@/constants/images";
import { getMeeting, updateMeetingStatus, updateMeetingTitle } from "@/db/queries/meetings";
import { indexMeeting } from "@/db/queries/search";
import { upsertSummary } from "@/db/queries/summaries";
import { createTodo, deleteTodosForMeeting } from "@/db/queries/todos";
import { upsertTranscript } from "@/db/queries/transcripts";
import { generateId } from "@/lib/id";
import { transcribeMeetingAudio, type TranscribeMeetingResult } from "@/services/asr";
import { ensureAsrModelsDownloaded } from "@/services/asr/models";
import {
  extractActionItems,
  generateMeetingSummary,
  generateMeetingTitle,
  type ExtractedActionItem,
} from "@/services/llm";
import { resolveAudioFileUri } from "@/services/recording";
import { useRecordingStore } from "@/store/recording";
import { useSettingsStore } from "@/store/settings";
import { colors } from "@/theme";

const STEPS = ["Transcribing audio", "Writing the summary", "Finding action items"];

// Module-level Set to track which meetings are currently processing — prevents
// duplicate transcription work from double-invoked effects (React StrictMode
// double-mount, fast remounts, etc.) while preserving correct behavior for
// genuinely distinct meetings running concurrently.
const processingMeetings = new Set<string>();

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
  const activeModelTier = useSettingsStore((state) => state.activeModelTier);
  // Populated by the step-0/1/2 effects, read by the finalize effect once
  // all steps complete — avoids threading results through state just to
  // hand them to the next effect.
  const transcriptRef = useRef<TranscribeMeetingResult | null>(null);
  const summaryTextRef = useRef<string>("");
  const actionItemsRef = useRef<ExtractedActionItem[]>([]);

  useEffect(() => {
    if (currentStep >= STEPS.length) {
      let isMounted = true;
      const finish = async () => {
        try {
          const meeting = await getMeeting(id);
          const transcript = transcriptRef.current;
          const summaryText = summaryTextRef.current;

          if (meeting) {
            if (transcript) {
              await upsertTranscript({
                meetingId: id,
                text: transcript.text,
                segments: transcript.segments,
                language: transcript.language,
              });
            }
            if (summaryText) {
              await upsertSummary({ meetingId: id, summaryText, modelTier: activeModelTier });
            }

            // Manual dictations start out titled "New recording" (calendar
            // meetings already get a real title from the calendar event).
            // Name it from the summary once there's one to work from — but
            // only while it's still the placeholder, so this never clobbers
            // a title the user already edited on a later reprocess.
            let finalTitle = meeting.title;
            if (
              meeting.source === "manual_dictation" &&
              meeting.title.trim().toLowerCase() === "new recording" &&
              activeModelTier &&
              summaryText
            ) {
              try {
                const generatedTitle = await generateMeetingTitle(summaryText, activeModelTier);
                if (generatedTitle) {
                  finalTitle = generatedTitle;
                  await updateMeetingTitle(id, generatedTitle);
                }
              } catch (err) {
                console.error("[LLM] title generation failed:", err);
              }
            }

            // Clears any action items from a prior run before re-inserting —
            // this step also runs when reprocessing an already-"ready"
            // meeting (see the meeting detail screen's Reprocess button), so
            // without this, every reprocess would duplicate action items
            // rather than replace them.
            await deleteTodosForMeeting(id);
            await Promise.all(
              actionItemsRef.current.map((item) =>
                createTodo({
                  id: generateId(),
                  meetingId: id,
                  text: item.text,
                  ownerHint: item.ownerHint,
                  dueDate: item.dueDate,
                }),
              ),
            );
            await indexMeeting({
              meetingId: id,
              title: finalTitle,
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
      // Atomically claim the processing marker for this meetingId — if another
      // mounted or remounted instance already owns it, return early without
      // processing. Prevents duplicate transcription from double effects.
      if (processingMeetings.has(id)) {
        return;
      }
      processingMeetings.add(id);

      let isMounted = true;
      const transcribe = async () => {
        try {
          const meeting = await getMeeting(id);
          if (!meeting?.audioFilePath) {
            throw new Error("Recording has no audio file");
          }
          // The stored path embeds the app's container UUID at record time,
          // which changes on every native rebuild/reinstall during
          // development — re-anchor onto the current document directory
          // before touching disk (see resolveAudioFileUri's docstring in
          // services/recording for why), so reprocessing an older recording
          // after a rebuild doesn't report a missing file that's actually
          // sitting right there under the new container.
          const resolvedAudioFilePath = resolveAudioFileUri(meeting.audioFilePath);
          // Catches an empty/truncated recording early with a clear reason,
          // rather than handing whisper.rn a file it can't meaningfully
          // decode and hoping the resulting failure is self-explanatory.
          const audioFile = new File(resolvedAudioFilePath);
          if (!audioFile.exists || audioFile.size < 1024) {
            throw new Error("The recording file is missing or empty");
          }

          await ensureAsrModelsDownloaded((progress) => {
            if (isMounted) setModelDownloadFraction(progress.fraction < 1 ? progress.fraction : null);
          });
          if (isMounted) setModelDownloadFraction(null);

          transcriptRef.current = await transcribeMeetingAudio(resolvedAudioFilePath);
          if (isMounted) setCurrentStep((prev) => prev + 1);
        } catch (err) {
          // Local-only debug log (no transcript/audio content involved) —
          // see AGENTS.md Privacy & Network Rules.
          console.error("[ASR] transcription failed:", err);
<<<<<<< HEAD
          if (isMounted) setError("Failed to transcribe the recording");
        } finally {
          // Clear the marker when processing finishes (success or failure)
          // for this meetingId.
          processingMeetings.delete(id);
=======
          // Without this, the meeting row stays "processing" forever — not
          // "failed" — which is indistinguishable in the UI from a recording
          // that's still actively being worked on, and looks stuck.
          await updateMeetingStatus(id, "failed").catch(() => {});
          const message = err instanceof Error && err.message ? err.message : "Failed to transcribe the recording";
          if (isMounted) setError(message);
>>>>>>> feature-llm-summary-chat
        }
      };
      transcribe();
      return () => {
        isMounted = false;
      };
    }

    if (currentStep === 1) {
      let isMounted = true;
      const summarize = async () => {
        const transcriptText = transcriptRef.current?.text ?? "";
        // No model downloaded, or nothing was said — nothing to summarize.
        // Recording/transcript are still saved; this step just becomes a
        // no-op rather than blocking the rest of processing on it.
        if (activeModelTier && transcriptText) {
          try {
            summaryTextRef.current = await generateMeetingSummary(transcriptText, activeModelTier);
          } catch (err) {
            console.error("[LLM] summary generation failed:", err);
          }
        }
        if (isMounted) setCurrentStep((prev) => prev + 1);
      };
      summarize();
      return () => {
        isMounted = false;
      };
    }

    if (currentStep === 2) {
      let isMounted = true;
      const findActionItems = async () => {
        const transcriptText = transcriptRef.current?.text ?? "";
        if (activeModelTier && transcriptText) {
          try {
            actionItemsRef.current = await extractActionItems(transcriptText, activeModelTier);
          } catch (err) {
            console.error("[LLM] action item extraction failed:", err);
          }
        }
        if (isMounted) setCurrentStep((prev) => prev + 1);
      };
      findActionItems();
      return () => {
        isMounted = false;
      };
    }
  }, [currentStep, id, router, finishRecordingState, activeModelTier]);

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
