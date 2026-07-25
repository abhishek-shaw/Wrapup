import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@/theme";

type TodoItemProps = {
  title: string;
  subtitle?: string;
  completed: boolean;
  overdue?: boolean;
  onToggle: () => void;
};

export function TodoItem({ title, subtitle, completed, overdue, onToggle }: TodoItemProps) {
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-center gap-3 rounded-2xl bg-ink-surface p-4 active:opacity-80"
    >
      <View
        className={`h-6 w-6 items-center justify-center rounded-lg border-2 ${
          completed ? "border-amber bg-amber" : overdue ? "border-error" : "border-white/30"
        }`}
      >
        {completed ? <Ionicons name="checkmark" size={16} color={colors.mascot.features} /> : null}
      </View>
      <View className="flex-1 gap-1">
        <Text className={`text-h3 ${completed ? "text-ink-secondary line-through" : "text-white"}`}>
          {title}
        </Text>
        {subtitle ? (
          <Text className={`text-body-sm ${overdue && !completed ? "text-error" : "text-ink-secondary"}`}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
