import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Switch, Text, View } from "react-native";

import { ModelTierCard } from "@/components/model-tier-card";
import { SettingRow } from "@/components/setting-row";
import { LLM_MODEL_SPECS } from "@/services/llm/models";
import { useSettingsStore } from "@/store/settings";
import { colors } from "@/theme";
import type { ModelTier } from "@/types/models";

const TIERS: {
  tier: ModelTier;
  title: string;
  description: string;
  recommended?: boolean;
}[] = [
  {
    tier: "fast",
    title: "Fast",
    description: "Quicker summaries, good for short meetings. Best on older phones.",
    recommended: true,
  },
  {
    tier: "balanced",
    title: "Balanced",
    description: "The best mix of quality and speed for most meetings.",
  },
  {
    tier: "best_quality",
    title: "Best quality",
    description: "Richest summaries and chat answers. Needs more storage and a newer phone.",
  },
];

function sizeLabel(tier: ModelTier): string {
  return `${(LLM_MODEL_SPECS[tier].sizeBytes / 1e9).toFixed(2)} GB`;
}

export default function ChooseModel() {
  const router = useRouter();
  const { origin: originParam } = useLocalSearchParams<{ origin?: "onboarding" | "settings" }>();
  const origin: "onboarding" | "settings" = originParam === "onboarding" ? "onboarding" : "settings";
  const activeModelTier = useSettingsStore((state) => state.activeModelTier);
  const wifiOnly = useSettingsStore((state) => state.downloadOverWifiOnly);
  const setDownloadOverWifiOnly = useSettingsStore((state) => state.setDownloadOverWifiOnly);
  const completeOnboarding = useSettingsStore((state) => state.completeOnboarding);
  // Fast is the onboarding default — small enough that first-run setup
  // doesn't stall on a multi-GB download before the user can do anything.
  // Balanced stays the default when reached from Settings, matching its
  // "Recommended" badge below.
  const [selected, setSelected] = useState<ModelTier>(activeModelTier ?? "fast");

  // Mark onboarding complete the moment this step is reached rather than
  // waiting for a download to finish or for the user to explicitly skip —
  // otherwise killing the app mid-download would re-run the whole onboarding
  // flow (name, calendar, permissions) on next launch just because this one
  // optional step never finished. The model itself stays whatever it was
  // (downloaded, partial, or none); that's the same "download later from
  // Settings" recovery path a mid-download interruption already needs.
  useEffect(() => {
    if (origin === "onboarding") {
      completeOnboarding();
    }
  }, [origin, completeOnboarding]);

  const handleSkip = () => {
    if (origin === "onboarding") {
      router.replace("/today");
    } else {
      router.back();
    }
  };

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
              size={sizeLabel(item.tier)}
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
                onValueChange={setDownloadOverWifiOnly}
                trackColor={{ false: "#4A4A46", true: colors.primary.amber }}
                thumbColor="#FFFFFF"
              />
            }
          />
        </View>

        <View className="gap-3">
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/settings/download-model",
                params: { tier: selected, wifiOnly: wifiOnly.toString(), origin },
              })
            }
            className="h-14 items-center justify-center rounded-2xl bg-amber active:opacity-80"
          >
            <Text className="text-h3 text-mascot-features">Download and continue</Text>
          </Pressable>
          <Pressable onPress={handleSkip}>
            <Text className="text-center text-caption text-ink-secondary">
              Or Click Here to skip for now — you can download a model anytime from settings
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
