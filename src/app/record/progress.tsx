import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

import { createMeeting, updateMeetingStatus } from "@/db/queries/meetings";
import { generateId } from "@/lib/id";
import { colors } from "@/theme";

const BAR_COUNT = 7;

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function RecordingProgress() {
  const router = useRouter();
  const { title, calendarEventId, source } = useLocalSearchParams<{
    title?: string;
    calendarEventId?: string;
    source?: string;
  }>();
  const [seconds, setSeconds] = useState(0);
  const [barHeights, setBarHeights] = useState<number[]>(Array(BAR_COUNT).fill(12));
  const [stopping, setStopping] = useState(false);

  // Create meeting ID and promise synchronously to avoid race condition
  const meetingData = useRef<{ id: string; creationPromise: Promise<void> }>(
    (() => {
      const id = generateId();
      const creationPromise = createMeeting({
        id,
        title: title ?? "New recording",
        source: source === "calendar_meeting" ? "calendar_meeting" : "manual_dictation",
        calendarEventId: calendarEventId ?? null,
        startedAt: new Date().toISOString(),
        status: "recording",
      });
      return { id, creationPromise };
    })(),
  );

  useEffect(() => {
    const interval = setInterval(() => setSeconds((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setBarHeights(Array.from({ length: BAR_COUNT }, () => 8 + Math.round(Math.random() * 36)));
    }, 350);
    return () => clearInterval(interval);
  }, []);

  const stopRecording = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await meetingData.current.creationPromise;
      await updateMeetingStatus(meetingData.current.id, "processing");
      router.replace(`/record/processing?id=${meetingData.current.id}`);
    } catch {
      setStopping(false);
      // surface error to user here
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 items-center justify-between px-8 py-10">
        <View className="rounded-full bg-black/30 px-4 py-2">
          <View className="flex-row items-center gap-2">
            <View className="h-2 w-2 rounded-full bg-error" />
            <Text className="text-body-md text-error">Recording</Text>
          </View>
        </View>

        <View className="items-center gap-6">
          <View className="items-center gap-1">
            <Text className="text-display text-white">{formatDuration(seconds)}</Text>
            <Text className="text-body-lg text-ink-secondary">{title ?? "New recording"}</Text>
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
          className="h-20 w-20 items-center justify-center rounded-full bg-coral active:opacity-80"
        >
          <View className="h-6 w-6 rounded bg-white" />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
