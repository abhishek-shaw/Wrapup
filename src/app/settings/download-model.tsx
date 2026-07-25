import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

import { images } from "@/constants/images";
import { colors } from "@/theme";

const TOTAL_GB = 2.4;

export default function DownloadModel() {
  const router = useRouter();
  const [progress, setProgress] = useState(20);
  const [paused, setPaused] = useState(false);
  const done = progress >= 100;

  useEffect(() => {
    if (paused || done) return;
    const interval = setInterval(() => {
      setProgress((prev) => Math.min(100, prev + 4));
    }, 400);
    return () => clearInterval(interval);
  }, [paused, done]);

  useEffect(() => {
    if (!done) return;
    const timeout = setTimeout(() => router.replace("/today"), 600);
    return () => clearTimeout(timeout);
  }, [done, router]);

  const downloadedGb = ((progress / 100) * TOTAL_GB).toFixed(1);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 items-center justify-center gap-8 px-8">
        <Image source={images.mascotLogo} style={{ width: 96, height: 96 }} contentFit="contain" />

        <View className="items-center gap-2">
          <Text className="text-center text-h1 text-white">
            {done ? "Balanced model ready" : "Downloading Balanced model"}
          </Text>
          <Text className="text-center text-body-lg text-ink-secondary">
            {done ? "You're all set." : `${downloadedGb} GB of ${TOTAL_GB} GB · about 3 minutes left`}
          </Text>
        </View>

        <View className="w-full gap-2">
          <View className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <View className="h-2 rounded-full bg-amber" style={{ width: `${progress}%` }} />
          </View>
          <Text className="text-center text-body-md text-ink-secondary">{progress}%</Text>
        </View>

        <View className="w-full flex-row items-start gap-3 rounded-2xl bg-ink-surface p-4">
          <Ionicons name="information-circle-outline" size={20} color={colors.ink.textSecondary} />
          <Text className="flex-1 text-body-md text-ink-secondary">
            You can keep using the app while this downloads. Recording works now — summaries will be ready
            once this finishes.
          </Text>
        </View>

        <View className="w-full gap-3">
          <Pressable
            onPress={() => setPaused((prev) => !prev)}
            className="h-12 items-center justify-center rounded-2xl border border-white/20 active:opacity-70"
          >
            <Text className="text-h3 text-white">{paused ? "Resume download" : "Pause download"}</Text>
          </Pressable>
          <Text className="text-center text-caption text-ink-secondary">
            {paused ? "Download paused" : "Downloading over Wi-Fi"}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
