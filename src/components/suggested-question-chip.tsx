import React from "react";
import { Pressable, Text } from "react-native";

type SuggestedQuestionChipProps = {
  label: string;
  onPress: () => void;
};

export function SuggestedQuestionChip({ label, onPress }: SuggestedQuestionChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-full border border-white/15 bg-ink-surface px-4 py-2 active:opacity-70"
    >
      <Text className="text-body-sm text-white">{label}</Text>
    </Pressable>
  );
}
