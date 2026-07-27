import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text } from "react-native";

import { colors } from "@/theme";

type ModelNeededBannerProps = {
  label: string;
};

/** Nudge shown wherever a feature needs the on-device LLM but no model is
 * downloaded yet — the meeting detail screen (missing summary/action items)
 * and the per-meeting chat screen (can't answer questions) both use this. */
export function ModelNeededBanner({ label }: ModelNeededBannerProps) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push("/settings/choose-model")}
      className="flex-row items-center gap-2 rounded-2xl bg-ink-surface px-4 py-3 active:opacity-70"
    >
      <Ionicons name="download-outline" size={16} color={colors.ink.textSecondary} />
      <Text className="flex-1 text-body-sm text-ink-secondary">{label}</Text>
    </Pressable>
  );
}
