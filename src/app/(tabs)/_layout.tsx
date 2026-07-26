import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React, { useEffect } from "react";

import { useSettingsStore } from "@/store/settings";
import { selectDueSoonCount, useTodosStore } from "@/store/todos";
import { colors } from "@/theme";

export default function TabsLayout() {
  const load = useTodosStore((state) => state.load);
  const dueSoonCount = useTodosStore(selectDueSoonCount);
  const loadReminderPreferences = useSettingsStore((state) => state.loadReminderPreferences);

  useEffect(() => {
    // Reminder preferences must be loaded from AsyncStorage before todos
    // load and schedule against them — otherwise the very first load of the
    // session would schedule using the in-memory defaults instead of
    // whatever the user actually chose in Settings.
    loadReminderPreferences().then(() => load());
  }, [load, loadReminderPreferences]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary.amber,
        tabBarInactiveTintColor: colors.ink.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.ink.background,
          borderTopColor: "rgba(255,255,255,0.1)",
        },
        tabBarLabelStyle: { fontFamily: "Nunito_600SemiBold", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Today",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "sunny" : "sunny-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "albums" : "albums-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="todos"
        options={{
          title: "Todos",
          tabBarBadge: dueSoonCount > 0 ? dueSoonCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.semantic.error, fontSize: 10 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "list" : "list-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
