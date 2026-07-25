import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, SafeAreaView, Switch, Text, TextInput, View } from "react-native";

import { SettingRow } from "@/components/setting-row";
import { colors } from "@/theme";

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [autoRecord, setAutoRecord] = useState(true);
  const [remindTodos, setRemindTodos] = useState(true);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 justify-between px-5 pb-8 pt-8">
        <View className="gap-6">
          <View className="gap-2">
            <Text className="text-body-sm text-ink-secondary">Step 1 of 1</Text>
            <Text className="text-h1 text-white">A few quick things</Text>
            <Text className="text-body-lg text-ink-secondary">
              This only takes a moment, and you can change any of it later in settings.
            </Text>
          </View>

          <View className="gap-2">
            <Text className="text-h3 text-white">What should we call you?</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.ink.textSecondary}
              className="rounded-2xl border border-white/10 bg-ink-surface px-4 py-3 text-body-lg text-white"
            />
          </View>

          <View className="rounded-2xl bg-ink-surface">
            <View className="border-b border-white/10">
              <SettingRow
                icon="calendar-outline"
                title="Connect your calendar"
                description="So meetings show up automatically"
                control={
                  <Pressable
                    onPress={() => setCalendarConnected(true)}
                    className="rounded-xl border border-white/20 px-4 py-2 active:opacity-70"
                  >
                    <Text className="text-body-sm text-white">
                      {calendarConnected ? "Connected" : "Connect"}
                    </Text>
                  </Pressable>
                }
              />
            </View>
            <View className="border-b border-white/10">
              <SettingRow
                icon="mic-outline"
                title="Auto-record detected meetings"
                description="We'll always ask before recording starts"
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
              icon="notifications-outline"
              title="Remind me about open todos"
              description="Gentle nudges, never more than daily"
              control={
                <Switch
                  value={remindTodos}
                  onValueChange={setRemindTodos}
                  trackColor={{ false: "#4A4A46", true: colors.primary.amber }}
                  thumbColor="#FFFFFF"
                />
              }
            />
          </View>
        </View>

        <Pressable
          onPress={() => router.push("/permissions")}
          className="h-14 items-center justify-center rounded-2xl bg-amber active:opacity-80"
        >
          <Text className="text-h3 text-mascot-features">Continue</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
