import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, Switch, Text, View } from "react-native";

import { ModelTierCard } from "@/components/model-tier-card";
import { SettingRow } from "@/components/setting-row";
import { getRecommendedModelTier } from "@/services/llm/device";
import { LLM_MODEL_SPECS } from "@/services/llm/models";
import { useModelDownloadStore } from "@/store/modelDownload";
import { useSettingsStore } from "@/store/settings";
import { colors } from "@/theme";
import type { ModelTier } from "@/types/models";

const TIERS: {
  tier: ModelTier;
  title: string;
  description: string;
}[] = [
  {
    tier: "fast",
    title: "Fast",
    description: "Quicker summaries, good for short meetings. Best on older phones.",
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
  const setActiveModelTier = useSettingsStore((state) => state.setActiveModelTier);
  const downloadedTiers = useSettingsStore((state) => state.downloadedTiers);
  const verifyingProgress = useSettingsStore((state) => state.verifyingProgress);
  const wifiOnly = useSettingsStore((state) => state.downloadOverWifiOnly);
  const setDownloadOverWifiOnly = useSettingsStore((state) => state.setDownloadOverWifiOnly);
  const completeOnboarding = useSettingsStore((state) => state.completeOnboarding);
  const activeDownload = useModelDownloadStore((state) => state.activeDownload);
  // Recommended purely from the device's total RAM (see services/llm/device
  // for the reasoning behind the thresholds) — guidance only, every tier
  // stays fully selectable regardless of what's recommended. Falls back to
  // "fast" if RAM can't be read (e.g. web preview), the safest default.
  const recommendedTier = getRecommendedModelTier();
  // An existing user's already-downloaded tier always wins over the
  // recommendation — re-visiting this screen shouldn't second-guess a
  // choice they already made.
  const [selected, setSelected] = useState<ModelTier>(activeModelTier ?? recommendedTier);

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

  // Multiple tiers can be downloaded and kept on disk at once — switching to
  // one that's already there is a pure preference change, no re-download or
  // re-verification needed (see store/settings.ts's setActiveModelTier).
  const selectedDownloaded = downloadedTiers.includes(selected);
  const selectedActive = activeModelTier === selected;

  const handleUseSelected = async () => {
    await setActiveModelTier(selected);
    router.replace(origin === "onboarding" ? "/today" : "/settings");
  };

  const handleDownloadSelected = () => {
    // Only one download runs at a time (see store/modelDownload.ts) — send
    // the user to the one already in flight instead of silently no-oping.
    if (activeDownload && activeDownload.tier !== selected) {
      Alert.alert(
        "A download is already in progress",
        `Wait for the ${LLM_MODEL_SPECS[activeDownload.tier].label} model to finish (or cancel it) before starting another.`,
        [
          { text: "OK", style: "cancel" },
          {
            text: "Go to download",
            onPress: () =>
              router.push({
                pathname: "/settings/download-model",
                params: {
                  tier: activeDownload.tier,
                  wifiOnly: activeDownload.wifiOnly.toString(),
                  origin: activeDownload.origin,
                },
              }),
          },
        ],
      );
      return;
    }
    router.push({
      pathname: "/settings/download-model",
      params: { tier: selected, wifiOnly: wifiOnly.toString(), origin },
    });
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
          <Text className="text-body-sm text-ink-secondary">
            Based on your device&apos;s memory, we recommend{" "}
            {TIERS.find((item) => item.tier === recommendedTier)?.title}.
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
              recommended={item.tier === recommendedTier}
              statusLabel={(() => {
                const isActive = activeModelTier === item.tier;
                const verifyFraction = verifyingProgress[item.tier];
                const isVerifying = verifyFraction !== undefined;
                // "Active" always wins over "Verifying…" — the model is
                // already usable the instant it's active (verification is a
                // background integrity check that runs after the fact), so
                // hiding that behind "Verifying…" would wrongly suggest it
                // isn't ready yet.
                if (isActive) return isVerifying ? `Active · Verifying… ${Math.round(verifyFraction * 100)}%` : "Active";
                if (isVerifying) return `Verifying… ${Math.round(verifyFraction * 100)}%`;
                return downloadedTiers.includes(item.tier) ? "Downloaded" : undefined;
              })()}
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
          {selectedActive ? (
            <View className="h-14 items-center justify-center rounded-2xl border border-white/10">
              <Text className="text-h3 text-ink-secondary">This model is already active</Text>
            </View>
          ) : selectedDownloaded ? (
            <Pressable
              onPress={handleUseSelected}
              className="h-14 items-center justify-center rounded-2xl bg-amber active:opacity-80"
            >
              <Text className="text-h3 text-mascot-features">Use this model</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleDownloadSelected}
              className="h-14 items-center justify-center rounded-2xl bg-amber active:opacity-80"
            >
              <Text className="text-h3 text-mascot-features">Download and continue</Text>
            </Pressable>
          )}
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
