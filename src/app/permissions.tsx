import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, Text, View } from "react-native";

import { PermissionCard } from "@/components/permission-card";
import { useSettingsStore } from "@/store/settings";
import { colors } from "@/theme";

export default function Permissions() {
  const router = useRouter();
  const completeOnboarding = useSettingsStore((state) => state.completeOnboarding);
  const notificationsEnabled = useSettingsStore((state) => state.notificationsEnabled);
  const loadNotificationStatus = useSettingsStore((state) => state.loadNotificationStatus);
  const enableNotifications = useSettingsStore((state) => state.enableNotifications);
  const [requestingNotifications, setRequestingNotifications] = useState(false);

  useEffect(() => {
    loadNotificationStatus();
  }, [loadNotificationStatus]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 justify-between px-5 pb-8 pt-8">
        <View className="gap-6">
          <View className="gap-2">
            <Text className="text-h1 text-white">Wrapup needs a few permissions</Text>
            <Text className="text-body-lg text-ink-secondary">
              Here&apos;s exactly why, before your phone asks. Everything below stays on this device.
            </Text>
          </View>

          <View className="gap-3">
            <PermissionCard
              icon="calendar-outline"
              iconColor={colors.permission.calendarIcon}
              iconBackgroundClassName="bg-permission-calendar-bg"
              title="Calendar"
              description="So we can show your meetings and know when to offer to record."
            />
            <PermissionCard
              icon="mic-outline"
              iconColor={colors.permission.microphoneIcon}
              iconBackgroundClassName="bg-permission-microphone-bg"
              title="Microphone"
              description="To record meetings and dictation. We'll always ask first, every time."
            />
            <PermissionCard
              icon="notifications-outline"
              iconColor={colors.permission.notificationsIcon}
              iconBackgroundClassName="bg-permission-notifications-bg"
              title="Notifications"
              description="For reminders about action items you haven't finished yet."
              control={
                notificationsEnabled ? (
                  <Text className="text-body-sm text-ink-secondary">Enabled</Text>
                ) : (
                  <Pressable
                    onPress={async () => {
                      setRequestingNotifications(true);
                      await enableNotifications();
                      setRequestingNotifications(false);
                    }}
                    disabled={requestingNotifications}
                    className="rounded-xl border border-white/20 px-4 py-2 active:opacity-70 disabled:opacity-60"
                  >
                    {requestingNotifications ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text className="text-body-sm text-white">Enable</Text>
                    )}
                  </Pressable>
                )
              }
            />
          </View>

          <View className="flex-row items-center gap-2 rounded-2xl bg-permission-privacy-bg p-4">
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.permission.privacyIcon} />
            <Text className="flex-1 text-body-md text-permission-privacy-icon">
              None of this data ever leaves your phone.
            </Text>
          </View>
        </View>

        <View className="gap-3">
          <Pressable
            onPress={async () => {
              await completeOnboarding();
              router.replace("/today");
            }}
            className="h-12 items-center justify-center rounded-2xl bg-amber active:opacity-80"
          >
            <Text className="text-h3 text-mascot-features">Continue</Text>
          </Pressable>
          <Text className="text-center text-caption text-ink-secondary">
            You&apos;ll be asked for each one individually
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
