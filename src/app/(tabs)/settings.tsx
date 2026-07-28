import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SettingRow } from "@/components/setting-row";
import { LLM_MODEL_SPECS } from "@/services/llm/models";
import { useModelDownloadStore } from "@/store/modelDownload";
import { REMINDER_LEAD_TIME_OPTIONS, useSettingsStore } from "@/store/settings";
import { useTodosStore } from "@/store/todos";
import { colors } from "@/theme";
import type { ModelTier } from "@/types/models";

const MODEL_NAMES: Record<ModelTier, string> = {
  fast: "Fast",
  balanced: "Balanced",
  best_quality: "Best quality",
};

const MODEL_TIERS: ModelTier[] = ["fast", "balanced", "best_quality"];

export default function Settings() {
  const router = useRouter();
  const [autoRecord, setAutoRecord] = useState(true);
  const [requireFaceId, setRequireFaceId] = useState(false);
  const activeModelTier = useSettingsStore((state) => state.activeModelTier);
  const setActiveModelTier = useSettingsStore((state) => state.setActiveModelTier);
  const deleteModelTier = useSettingsStore((state) => state.deleteModelTier);
  const downloadedTiers = useSettingsStore((state) => state.downloadedTiers);
  const verifyingProgress = useSettingsStore((state) => state.verifyingProgress);
  const downloadOverWifiOnly = useSettingsStore((state) => state.downloadOverWifiOnly);
  const activeDownload = useModelDownloadStore((state) => state.activeDownload);
  const calendarConnected = useSettingsStore((state) => state.calendarConnected);
  const loadCalendarStatus = useSettingsStore((state) => state.loadCalendarStatus);
  const connectCalendar = useSettingsStore((state) => state.connectCalendar);
  const notificationsEnabled = useSettingsStore((state) => state.notificationsEnabled);
  const loadNotificationStatus = useSettingsStore((state) => state.loadNotificationStatus);
  const enableNotifications = useSettingsStore((state) => state.enableNotifications);
  const remindAboutOpenTodos = useSettingsStore((state) => state.remindAboutOpenTodos);
  const setRemindAboutOpenTodos = useSettingsStore((state) => state.setRemindAboutOpenTodos);
  const reminderLeadTimeMinutes = useSettingsStore((state) => state.reminderLeadTimeMinutes);
  const setReminderLeadTimeMinutes = useSettingsStore((state) => state.setReminderLeadTimeMinutes);
  const resyncReminders = useTodosStore((state) => state.resyncReminders);

  useEffect(() => {
    loadCalendarStatus();
    loadNotificationStatus();
  }, [loadCalendarStatus, loadNotificationStatus]);

  const handleToggleRemindAboutTodos = async (enabled: boolean) => {
    // Toggling this on is also this screen's ask for notification
    // permission, mirroring how Calendar's "Connect" button above requests
    // its permission inline rather than sending the user back to onboarding.
    if (enabled && !notificationsEnabled) {
      await enableNotifications();
    }
    await setRemindAboutOpenTodos(enabled);
    await resyncReminders();
  };

  const currentLeadTimeLabel =
    REMINDER_LEAD_TIME_OPTIONS.find((option) => option.minutes === reminderLeadTimeMinutes)?.label ??
    "At due time";

  const handlePressLeadTime = () => {
    Alert.alert(
      "Remind me",
      "How far ahead of the due date should we remind you?",
      REMINDER_LEAD_TIME_OPTIONS.map((option) => ({
        text: option.label,
        onPress: async () => {
          await setReminderLeadTimeMinutes(option.minutes);
          await resyncReminders();
        },
      })),
    );
  };

  const handleDeleteModel = (tier: ModelTier) => {
    const sizeGb = (LLM_MODEL_SPECS[tier].sizeBytes / 1e9).toFixed(2);
    const isActive = activeModelTier === tier;
    // Only relevant when deleting the active tier — if another downloaded
    // model is still around, deleteModelTier falls back to it automatically
    // (see store/settings.ts) rather than leaving summarization/chat broken.
    const fallbackTier = isActive ? downloadedTiers.find((candidate) => candidate !== tier) : undefined;
    const message = !isActive
      ? `This frees up ${sizeGb} GB and doesn't affect your active model.`
      : fallbackTier
        ? `We'll switch you to the ${MODEL_NAMES[fallbackTier]} model, which you already have downloaded.`
        : "Summarization and meeting chat won't work until you download a model again. Recording and transcription aren't affected.";

    Alert.alert(`Delete ${MODEL_NAMES[tier]} model?`, message, [
      { text: "Cancel", style: "cancel" },
      { text: `Delete, free up ${sizeGb} GB`, style: "destructive", onPress: () => deleteModelTier(tier) },
    ]);
  };

  const handleDownloadTier = (tier: ModelTier) => {
    // Only one download runs at a time (see store/modelDownload.ts) — send
    // the user to the one already in flight instead of silently no-oping.
    if (activeDownload && activeDownload.tier !== tier) {
      Alert.alert(
        "A download is already in progress",
        `Wait for the ${MODEL_NAMES[activeDownload.tier]} model to finish (or cancel it) before starting another.`,
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
      params: { tier, wifiOnly: downloadOverWifiOnly.toString(), origin: "settings" },
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <ScrollView className="flex-1 px-5 pt-4" contentContainerClassName="gap-5 pb-8">
        <Text className="text-h1 text-white">Settings</Text>

        <View className="flex-row items-start gap-3 rounded-2xl bg-permission-privacy-bg p-4">
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.permission.privacyIcon} />
          <Text className="flex-1 text-body-md text-permission-privacy-icon">
            Everything runs on this device. No audio, transcript, or summary has ever left your phone.
          </Text>
        </View>

        <View className="gap-2">
          <Text className="px-1 text-caption text-ink-secondary">ON-DEVICE MODELS</Text>
          <Text className="px-1 text-body-sm text-ink-secondary">
            You can keep more than one model downloaded and switch between them anytime.
          </Text>
          <View className="rounded-2xl bg-ink-surface">
            {MODEL_TIERS.map((tier, index) => {
              const downloaded = downloadedTiers.includes(tier);
              const isActive = activeModelTier === tier;
              const verifyFraction = verifyingProgress[tier];
              const isVerifying = verifyFraction !== undefined;
              const downloadProgress = activeDownload?.tier === tier ? activeDownload : null;
              const downloadPercent =
                downloadProgress && downloadProgress.totalBytes > 0
                  ? Math.round((downloadProgress.bytesWritten / downloadProgress.totalBytes) * 100)
                  : 0;
              const sizeGb = (LLM_MODEL_SPECS[tier].sizeBytes / 1e9).toFixed(2);
              // "Active" always wins over "Verifying…" — the model is already
              // usable the instant it's active (verification is a background
              // integrity check that runs after the fact, see
              // verifyModelInBackground), so hiding that behind "Verifying…"
              // would wrongly suggest it isn't ready yet.
              const statusText = isActive
                ? isVerifying
                  ? `Active · Verifying… ${Math.round(verifyFraction * 100)}%`
                  : "Active"
                : isVerifying
                  ? `Verifying… ${Math.round(verifyFraction * 100)}%`
                  : downloadProgress
                    ? downloadProgress.phase === "waiting_for_wifi"
                      ? "Waiting for Wi-Fi…"
                      : downloadProgress.phase === "paused"
                        ? `Paused · ${downloadPercent}%`
                        : downloadProgress.phase === "error"
                          ? "Download failed"
                          : `Downloading… ${downloadPercent}%`
                    : downloaded
                      ? "Downloaded"
                      : "Not downloaded";
              return (
                <View key={tier} className={index < MODEL_TIERS.length - 1 ? "border-b border-white/10" : ""}>
                  <SettingRow
                    icon="hardware-chip-outline"
                    title={MODEL_NAMES[tier]}
                    description={`${sizeGb} GB · ${statusText}`}
                    control={
                      isVerifying ? (
                        // A background integrity check is real CPU work that can
                        // make the rest of the app feel sluggish while it runs —
                        // hiding Use/Delete here also avoids racing against the
                        // delete verifyModelInBackground may issue itself on failure.
                        <ActivityIndicator size="small" color={colors.ink.textSecondary} />
                      ) : downloadProgress ? (
                        <Pressable
                          onPress={() =>
                            router.push({
                              pathname: "/settings/download-model",
                              params: {
                                tier,
                                wifiOnly: downloadProgress.wifiOnly.toString(),
                                origin: downloadProgress.origin,
                              },
                            })
                          }
                          className="rounded-xl border border-white/20 px-4 py-2 active:opacity-70"
                        >
                          <Text className="text-body-sm text-white">View</Text>
                        </Pressable>
                      ) : !downloaded ? (
                        <Pressable
                          onPress={() => handleDownloadTier(tier)}
                          className="rounded-xl bg-amber px-4 py-2 active:opacity-80"
                        >
                          <Text className="text-body-sm text-mascot-features">Download</Text>
                        </Pressable>
                      ) : (
                        <View className="flex-row items-center gap-3">
                          {!isActive ? (
                            <Pressable
                              onPress={() => setActiveModelTier(tier)}
                              className="rounded-xl border border-white/20 px-4 py-2 active:opacity-70"
                            >
                              <Text className="text-body-sm text-white">Use</Text>
                            </Pressable>
                          ) : null}
                          <Pressable
                            onPress={() => handleDeleteModel(tier)}
                            className="h-8 w-8 items-center justify-center active:opacity-70"
                          >
                            <Ionicons name="trash-outline" size={18} color={colors.semantic.error} />
                          </Pressable>
                        </View>
                      )
                    }
                  />
                </View>
              );
            })}
          </View>
        </View>

        <View className="rounded-2xl bg-ink-surface">
          <View className="border-b border-white/10">
            <SettingRow
              icon="calendar-outline"
              title="Calendar access"
              control={
                calendarConnected ? (
                  <Text className="text-body-md text-ink-secondary">Connected</Text>
                ) : (
                  <Pressable
                    onPress={() => connectCalendar()}
                    className="rounded-xl border border-white/20 px-4 py-2 active:opacity-70"
                  >
                    <Text className="text-body-sm text-white">Connect</Text>
                  </Pressable>
                )
              }
            />
          </View>
          <View className="border-b border-white/10">
            <SettingRow
              icon="mic-outline"
              title="Auto-record detected meetings"
              control={
                <Switch
                  value={autoRecord}
                  onValueChange={setAutoRecord}
                  trackColor={{ false: "#4A4A46", true: colors.primary.amber }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </View>
          <SettingRow
            icon="lock-closed-outline"
            title="Require Face ID to open"
            control={
              <Switch
                value={requireFaceId}
                onValueChange={setRequireFaceId}
                trackColor={{ false: "#4A4A46", true: colors.primary.amber }}
                thumbColor="#FFFFFF"
              />
            }
          />
        </View>

        <View className="gap-2">
          <Text className="px-1 text-caption text-ink-secondary">TODO REMINDERS</Text>
          <View className="rounded-2xl bg-ink-surface">
            <View className={remindAboutOpenTodos ? "border-b border-white/10" : ""}>
              <SettingRow
                icon="notifications-outline"
                title="Remind me about overdue items"
                description={
                  reminderLeadTimeMinutes === 0
                    ? "A local notification arrives right when an action item is due."
                    : `A local notification arrives ${currentLeadTimeLabel.toLowerCase()} an action item is due.`
                }
                control={
                  <Switch
                    value={remindAboutOpenTodos}
                    onValueChange={handleToggleRemindAboutTodos}
                    trackColor={{ false: "#4A4A46", true: colors.primary.amber }}
                    thumbColor="#FFFFFF"
                  />
                }
              />
            </View>
            {remindAboutOpenTodos ? (
              <SettingRow
                icon="time-outline"
                title="Remind me"
                control={
                  <Pressable
                    onPress={handlePressLeadTime}
                    className="flex-row items-center gap-1 active:opacity-70"
                  >
                    <Text className="text-body-md text-ink-secondary">{currentLeadTimeLabel}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.ink.textSecondary} />
                  </Pressable>
                }
              />
            ) : null}
          </View>
        </View>

        <Pressable className="flex-row items-center gap-3 rounded-2xl bg-ink-surface px-4 py-4 active:opacity-70">
          <Ionicons name="server-outline" size={20} color="#C3C2B8" />
          <Text className="flex-1 text-h3 text-white">Export my data</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.ink.textSecondary} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
