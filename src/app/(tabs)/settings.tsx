import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Switch, Text, View } from "react-native";

import { SettingRow } from "@/components/setting-row";
import { useSettingsStore } from "@/store/settings";
import { colors } from "@/theme";

export default function Settings() {
  const router = useRouter();
  const [autoRecord, setAutoRecord] = useState(true);
  const [requireFaceId, setRequireFaceId] = useState(false);
  const calendarConnected = useSettingsStore((state) => state.calendarConnected);
  const loadCalendarStatus = useSettingsStore((state) => state.loadCalendarStatus);
  const connectCalendar = useSettingsStore((state) => state.connectCalendar);

  useEffect(() => {
    loadCalendarStatus();
  }, [loadCalendarStatus]);

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

        <Pressable className="flex-row items-center gap-3 rounded-2xl bg-ink-surface px-4 py-4 active:opacity-70">
          <Ionicons name="server-outline" size={20} color="#C3C2B8" />
          <Text className="flex-1 text-h3 text-white">Export my data</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.ink.textSecondary} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
