import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";

import { SummaryCard } from "@/components/summary-card";
import { TodoItem } from "@/components/todo-item";
import { getMeeting } from "@/db/queries/meetings";
import { getSummary } from "@/db/queries/summaries";
import { useTodosStore } from "@/store/todos";
import { colors } from "@/theme";
import type { Meeting, Summary } from "@/types/models";

export default function MeetingSummary() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
  const [summary, setSummary] = useState<Summary | null>(null);

  const allTodos = useTodosStore((state) => state.todos);
  const loadTodos = useTodosStore((state) => state.load);
  const toggleTodo = useTodosStore((state) => state.toggle);
  const actionItems = allTodos.filter((todo) => todo.meetingId === id);

  useFocusEffect(
    useCallback(() => {
      getMeeting(id).then(setMeeting);
      getSummary(id).then(setSummary);
      loadTodos();
    }, [id, loadTodos]),
  );

  if (meeting === undefined) return null;

  if (!meeting) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-h2 text-white">Meeting not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const timeLabel = new Date(meeting.startedAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const dateLabel = new Date(meeting.startedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <ScrollView className="flex-1 px-5 pt-4" contentContainerClassName="gap-4 pb-4">
        <Pressable onPress={() => router.back()} className="h-8 w-8 items-center justify-center">
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </Pressable>

        <View className="gap-1">
          <Text className="text-body-sm text-ink-secondary">
            {dateLabel} · {timeLabel}
            {meeting.attendeeCount ? ` · ${meeting.attendeeCount} people` : ""}
          </Text>
          <Text className="text-h1 text-white">{meeting.title}</Text>
        </View>

        {summary ? (
          <SummaryCard label="Summary">
            <Text className="text-body-lg text-white">{summary.summaryText}</Text>
          </SummaryCard>
        ) : null}

        {actionItems.length > 0 ? (
          <SummaryCard label="Action items">
            <View className="gap-3">
              {actionItems.map((item) => (
                <TodoItem
                  key={item.id}
                  title={item.text}
                  completed={item.completed}
                  onToggle={() => toggleTodo(item.id)}
                />
              ))}
            </View>
          </SummaryCard>
        ) : null}

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => router.push(`/meeting/${meeting.id}/chat`)}
            className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-amber active:opacity-80"
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.mascot.features} />
            <Text className="text-h3 text-mascot-features">Ask about this meeting</Text>
          </Pressable>
          <Pressable className="h-14 w-14 items-center justify-center rounded-2xl border border-white/20 active:opacity-70">
            <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
