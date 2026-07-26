import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

type PermissionCardProps = {
  icon: keyof typeof Ionicons.glyphMap;
  /** Ionicons renders its glyph as a native font, not a styleable View, so the
   * fill color must be passed directly rather than via a NativeWind class. */
  iconColor: string;
  iconBackgroundClassName: string;
  title: string;
  description: string;
  /** Optional trailing action/status, e.g. an "Enable"/"Enabled" control —
   * same convention as SettingRow's `control` prop. Cards without a natural
   * point of use elsewhere (unlike calendar/mic, requested contextually) can
   * request permission directly from here instead of staying purely
   * descriptive. */
  control?: React.ReactNode;
};

export function PermissionCard({
  icon,
  iconColor,
  iconBackgroundClassName,
  title,
  description,
  control,
}: PermissionCardProps) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl bg-ink-surface p-4">
      <View className={`h-9 w-9 items-center justify-center rounded-lg ${iconBackgroundClassName}`}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-h3 text-white">{title}</Text>
        <Text className="text-body-sm text-ink-secondary">{description}</Text>
      </View>
      {control}
    </View>
  );
}
