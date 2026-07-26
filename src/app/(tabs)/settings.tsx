import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, Switch, Text, View } from "react-native";

import { SettingRow } from "@/components/setting-row";
import { REMINDER_LEAD_TIME_OPTIONS, useSettingsStore } from "@/store/settings";
import { useTodosStore } from "@/store/todos";
import { colors } from "@/theme";

export default function Settings() {
  const router = useRouter();
  const [autoRecord, setAutoRecord] = useState(true);
  const [requireFaceId, setRequireFaceId] = useState(false);
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
          <Text className="px-1 text-caption text-ink-secondary">ON-DEVICE MODEL</Text>
          <View className="rounded-2xl bg-ink-surface">
            <View className="border-b border-white/10">
              <SettingRow
                icon="hardware-chip-outline"
                title="Balanced"
                description="2.4 GB · downloaded"
                control={
                  <Pressable
                    onPress={() => router.push("/settings/choose-model")}
                    className="rounded-xl border border-white/20 px-4 py-2 active:opacity-70"
                  >
                    <Text className="text-body-sm text-white">Switch</Text>
                  </Pressable>
                }
              />
            </View>
            <Pressable className="flex-row items-center gap-3 px-4 py-4 active:opacity-70">
              <Ionicons name="trash-outline" size={20} color={colors.semantic.error} />
              <Text className="text-h3 text-error">Delete model, free up 2.4 GB</Text>
            </Pressable>
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
