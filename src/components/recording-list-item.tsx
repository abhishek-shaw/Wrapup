import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

type RecordingListItemBadge = {
  label: string;
  variant: "processing" | "failed";
};

type RecordingListItemProps = {
  title: string;
  subtitle: string;
  icon: "people" | "mic";
  badge?: RecordingListItemBadge;
  onPress: () => void;
};

const BADGE_CLASSNAMES: Record<RecordingListItemBadge["variant"], string> = {
  processing: "bg-coral/20",
  failed: "bg-error/20",
};

const BADGE_TEXT_CLASSNAMES: Record<RecordingListItemBadge["variant"], string> = {
  processing: "text-coral",
  failed: "text-error",
};

export function RecordingListItem({ title, subtitle, icon, badge, onPress }: RecordingListItemProps) {
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
      {badge ? (
        <View className={`self-center rounded-full px-3 py-1.5 ${BADGE_CLASSNAMES[badge.variant]}`}>
          <Text className={`text-caption font-semibold ${BADGE_TEXT_CLASSNAMES[badge.variant]}`}>{badge.label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
