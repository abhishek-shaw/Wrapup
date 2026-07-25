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
  const { title } = useLocalSearchParams<{ title?: string }>();
  const meetingTitle = title ?? "New recording";
  const [seconds, setSeconds] = useState(0);
  const [barHeights, setBarHeights] = useState<number[]>(Array(BAR_COUNT).fill(12));
  const [meetingId] = useState(() => generateId());
  const [stopping, setStopping] = useState(false);
  const meetingCreated = useRef<Promise<void> | null>(null);

  useEffect(() => {
    meetingCreated.current = createMeeting({
      id: meetingId,
      title: meetingTitle,
      source: "manual_dictation",
      startedAt: new Date().toISOString(),
      status: "recording",
    });
  }, [meetingId, meetingTitle]);

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
    await meetingCreated.current;
    await updateMeetingStatus(meetingId, "processing");
    router.replace(`/record/processing?id=${meetingId}`);
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
            <Text className="text-body-lg text-ink-secondary">{meetingTitle}</Text>
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
