import React from "react";
import { Pressable, Text, View } from "react-native";

type ModelTierCardProps = {
  title: string;
  size: string;
  description: string;
  selected: boolean;
  recommended?: boolean;
  onPress: () => void;
};

export function ModelTierCard({
  title,
  size,
  description,
  selected,
  recommended,
  onPress,
}: ModelTierCardProps) {
  return (
    <Pressable onPress={onPress} className="relative">
      {recommended ? (
        <View className="absolute -top-3 left-4 z-10 rounded-full bg-amber px-3 py-1">
          <Text className="text-caption font-semibold text-mascot-features">Recommended</Text>
        </View>
      ) : null}
      <View
        className={`gap-1 rounded-2xl border p-4 ${
          selected ? "border-amber bg-cream" : "border-white/10 bg-ink-surface"
        }`}
      >
        <View className="flex-row items-center justify-between">
          <Text className={`text-h3 ${selected ? "text-mascot-features" : "text-white"}`}>{title}</Text>
          <Text className={`text-body-md ${selected ? "text-deep-amber" : "text-ink-secondary"}`}>
            {size}
          </Text>
        </View>
        <Text className={`text-body-md ${selected ? "text-deep-amber" : "text-ink-secondary"}`}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}
