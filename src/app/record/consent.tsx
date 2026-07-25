import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@/theme";

export default function RecordingConsent() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center bg-black/70 px-6">
      <Stack.Screen options={{ presentation: "transparentModal", animation: "fade" }} />

      <View className="w-full gap-5 rounded-3xl bg-ink-surface p-6">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-black/30">
          <Ionicons name="mic-outline" size={26} color="#FFFFFF" />
        </View>

        <View className="gap-2">
          <Text className="text-h1 text-white">Record this meeting?</Text>
          <Text className="text-body-lg text-ink-secondary">
            Audio stays on this device. Nothing is uploaded or sent to a server at any point.
          </Text>
        </View>

        <View className="flex-row items-center gap-3 rounded-2xl bg-black/30 p-4">
          <Ionicons name="people-outline" size={18} color={colors.ink.textSecondary} />
          <Text className="flex-1 text-body-md text-ink-secondary">
            Make sure everyone in this meeting knows it&apos;s being recorded.
          </Text>
        </View>

        <View className="gap-3">
          <Pressable
            onPress={() => router.replace("/record/progress")}
            className="h-14 items-center justify-center rounded-2xl bg-white active:opacity-80"
          >
            <Text className="text-h3 text-text-primary">Start recording</Text>
          </Pressable>
          <Pressable
            onPress={() => router.back()}
            className="h-14 items-center justify-center rounded-2xl border border-white/20 active:opacity-70"
          >
            <Text className="text-h3 text-white">Not this time</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
