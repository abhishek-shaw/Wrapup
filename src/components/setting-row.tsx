import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

type SettingRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  control: React.ReactNode;
};

export function SettingRow({ icon, title, description, control }: SettingRowProps) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-4">
      <Ionicons name={icon} size={20} color="#C3C2B8" />
      <View className="flex-1 gap-0.5">
        <Text className="text-h3 text-white">{title}</Text>
        {description ? <Text className="text-body-sm text-ink-secondary">{description}</Text> : null}
      </View>
      {control}
    </View>
  );
}
