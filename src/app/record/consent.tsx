import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";

import { createMeeting } from "@/db/queries/meetings";
import { generateId } from "@/lib/id";
import { requestMicrophonePermission, startCapture, stopCapture } from "@/services/recording";
import { useRecordingStore } from "@/store/recording";
import { colors } from "@/theme";

export default function RecordingConsent() {
  const router = useRouter();
  const beginRecording = useRecordingStore((state) => state.beginRecording);
  const { title, calendarEventId, source } = useLocalSearchParams<{
    title?: string;
    calendarEventId?: string;
    source?: string;
  }>();
  const [starting, setStarting] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    setPermissionDenied(false);

    const granted = await requestMicrophonePermission();
    if (!granted) {
      setStarting(false);
      setPermissionDenied(true);
      return;
    }

    const meetingTitle = title ?? "New recording";
    try {
      await startCapture();
    } catch {
      setStarting(false);
      return;
    }

    try {
      const meetingId = generateId();
      await createMeeting({
        id: meetingId,
        title: meetingTitle,
        source: source === "calendar_meeting" ? "calendar_meeting" : "manual_dictation",
        calendarEventId: calendarEventId ?? null,
        startedAt: new Date().toISOString(),
        status: "recording",
      });
      beginRecording({ meetingId, title: meetingTitle });
      // consent is presented as a transparentModal — replace() across two
      // different presentation styles (modal -> card) runs as two separate
      // transitions (dismiss, then push), which looks like a double swipe.
      // dismissTo collapses that into the single expected transition.
      router.dismissTo(`/record/progress?id=${meetingId}`);
    } catch {
      await stopCapture().catch(() => {});
      setStarting(false);
    }
  };

  return (
    <View
      className="flex-1 items-center justify-center px-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
    >
      <Stack.Screen
        options={{
          presentation: "transparentModal",
          animation: "fade",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />

      <View className="w-full gap-5 rounded-3xl bg-ink-surface p-6">
        <View
          className="h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        >
          <Ionicons name="mic-outline" size={26} color="#FFFFFF" />
        </View>

        <View className="gap-2">
          <Text className="text-h1 text-white">Record this meeting?</Text>
          <Text className="text-body-lg text-ink-secondary">
            Audio stays on this device. Nothing is uploaded or sent to a server at any point.
          </Text>
        </View>

        <View
          className="flex-row items-center gap-3 rounded-2xl p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        >
          <Ionicons name="people-outline" size={18} color={colors.ink.textSecondary} />
          <Text className="flex-1 text-body-md text-ink-secondary">
            Make sure everyone in this meeting knows it&apos;s being recorded.
          </Text>
        </View>

        {permissionDenied ? (
          <View className="gap-2 rounded-2xl p-4" style={{ backgroundColor: "rgba(226,75,74,0.2)" }}>
            <Text className="text-body-md text-white">
              {Platform.OS === "android"
                ? "Wrapup needs microphone and notification access (for the recording indicator) to record. Enable them for Wrapup in Settings, then try again."
                : "Wrapup needs microphone access to record. Enable it for Wrapup in Settings, then try again."}
            </Text>
            <Pressable onPress={() => Linking.openSettings()}>
              <Text className="text-body-md font-semibold text-white underline">Open Settings</Text>
            </Pressable>
          </View>
        ) : null}

        <View className="gap-3">
          <Pressable
            onPress={handleStart}
            disabled={starting}
            className="h-14 items-center justify-center rounded-2xl bg-white active:opacity-80 disabled:opacity-60"
          >
            <Text className="text-h3 text-text-primary">{starting ? "Starting…" : "Start recording"}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            disabled={starting}
            className="h-14 items-center justify-center rounded-2xl border border-white/20 active:opacity-70"
          >
            <Text className="text-h3 text-white">Not this time</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
