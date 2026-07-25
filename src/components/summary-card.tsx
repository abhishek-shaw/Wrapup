import React from "react";
import { Text, View } from "react-native";

type SummaryCardProps = {
  label: string;
  children: React.ReactNode;
};

export function SummaryCard({ label, children }: SummaryCardProps) {
  return (
    <View className="gap-3 rounded-2xl bg-ink-surface p-4">
      <Text className="text-body-sm text-ink-secondary">{label}</Text>
      {children}
    </View>
  );
}
