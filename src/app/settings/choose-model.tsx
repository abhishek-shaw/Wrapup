import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Switch, Text, View } from "react-native";

import { ModelTierCard } from "@/components/model-tier-card";
import { SettingRow } from "@/components/setting-row";
import { colors } from "@/theme";
import type { ModelTier } from "@/types/models";

const TIERS: {
  tier: ModelTier;
  title: string;
  size: string;
  description: string;
  recommended?: boolean;
}[] = [
  {
    tier: "fast",
    title: "Fast",
    size: "~1.2 GB",
    description: "Quicker summaries, good for short meetings. Best on older phones.",
  },
  {
    tier: "balanced",
    title: "Balanced",
    size: "~2.4 GB",
    description: "The best mix of quality and speed for most meetings.",
    recommended: true,
  },
  {
    tier: "best_quality",
    title: "Best quality",
    size: "~4.6 GB",
    description: "Richest summaries and chat answers. Needs more storage and a newer phone.",
  },
];

export default function ChooseModel() {
  const router = useRouter();
  const [selected, setSelected] = useState<ModelTier>("balanced");
  const [wifiOnly, setWifiOnly] = useState(true);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <ScrollView className="flex-1 px-5 pt-8" contentContainerClassName="gap-6 pb-6">
        <View className="gap-2">
          <Text className="text-h1 text-white">Choose your on-device model</Text>
          <Text className="text-body-lg text-ink-secondary">
            This downloads once and runs entirely on your phone from then on. You can change it later in
            settings.
          </Text>
        </View>

        <View className="gap-5">
          {TIERS.map((item) => (
            <ModelTierCard
              key={item.tier}
              title={item.title}
              size={item.size}
              description={item.description}
              selected={selected === item.tier}
              recommended={item.recommended}
              onPress={() => setSelected(item.tier)}
            />
          ))}
        </View>

        <View className="rounded-2xl bg-ink-surface">
          <SettingRow
            icon="wifi-outline"
            title="Download over Wi-Fi only"
            control={
              <Switch
                value={wifiOnly}
                onValueChange={setWifiOnly}
                trackColor={{ false: "#4A4A46", true: colors.primary.amber }}
                thumbColor="#FFFFFF"
              />
            }
          />
        </View>

        <View className="gap-3">
          <Pressable
            onPress={() => router.push("/settings/download-model")}
            className="h-14 items-center justify-center rounded-2xl bg-amber active:opacity-80"
          >
            <Text className="text-h3 text-mascot-features">Download and continue</Text>
          </Pressable>
          <Pressable onPress={() => router.back()}>
            <Text className="text-center text-caption text-ink-secondary">
              Or skip for now — you can download a model anytime from settings
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
