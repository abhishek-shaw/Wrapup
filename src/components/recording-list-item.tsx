import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

type RecordingListItemProps = {
  title: string;
  subtitle: string;
  icon: "people" | "mic";
  onPress: () => void;
};

export function RecordingListItem({ title, subtitle, icon, onPress }: RecordingListItemProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl bg-ink-surface p-4 active:opacity-80"
    >
      <View
        className={`h-11 w-11 items-center justify-center rounded-xl ${
          icon === "people" ? "bg-cream" : "bg-coral/20"
        }`}
      >
        <Ionicons
          name={icon === "people" ? "people-outline" : "mic-outline"}
          size={20}
          color={icon === "people" ? "#BA7517" : "#D85A30"}
        />
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-h3 text-white">{title}</Text>
        <Text className="text-body-sm text-ink-secondary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}
