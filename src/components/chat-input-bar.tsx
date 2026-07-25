import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, TextInput, View } from "react-native";

import { colors } from "@/theme";

type ChatInputBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
};

export function ChatInputBar({ value, onChangeText, onSend }: ChatInputBarProps) {
  const canSend = value.trim().length > 0;

  return (
    <View className="flex-row items-center gap-3">
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Ask about this meeting"
        placeholderTextColor={colors.ink.textSecondary}
        className="flex-1 rounded-2xl bg-ink-surface px-4 py-3 text-body-lg text-white"
      />
      <Pressable
        onPress={onSend}
        disabled={!canSend}
        style={{ opacity: canSend ? 1 : 0.5 }}
        className="h-11 w-11 items-center justify-center rounded-full bg-amber active:opacity-80"
      >
        <Ionicons name="arrow-up" size={20} color={colors.mascot.features} />
      </Pressable>
    </View>
  );
}
