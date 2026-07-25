import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { SafeAreaView, SectionList, Text, View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { TodoItem } from "@/components/todo-item";
import { listMeetings } from "@/db/queries/meetings";
import { isDueSoonOrOverdue, useTodosStore } from "@/store/todos";
import { colors } from "@/theme";

function formatDueLabel(dueDate: string | null): string {
  if (!dueDate) return "No due date";
  const due = new Date(dueDate);
  const today = new Date();
  const diffDays = Math.round((due.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0)) / 86400000);

  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due ${due.toLocaleDateString(undefined, { weekday: "long" })}`;
}

export default function Todos() {
  const router = useRouter();
  const todos = useTodosStore((state) => state.todos);
  const loaded = useTodosStore((state) => state.loaded);
  const load = useTodosStore((state) => state.load);
  const toggle = useTodosStore((state) => state.toggle);
  const [meetingTitles, setMeetingTitles] = useState<Record<string, string>>({});

  useEffect(() => {
    load();
    listMeetings().then((meetings) => {
      setMeetingTitles(Object.fromEntries(meetings.map((meeting) => [meeting.id, meeting.title])));
    });
  }, [load]);

  if (!loaded) return null;

  const open = todos.filter((todo) => !todo.completed);
  const completed = todos.filter((todo) => todo.completed);
  const sections = [
    ...(open.length ? [{ title: "Due soon", data: open }] : []),
    ...(completed.length ? [{ title: "Completed", data: completed }] : []),
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 px-5 pt-4">
        <Text className="text-h1 text-white">Todos</Text>
        <Text className="mb-5 mt-1 text-body-md text-ink-secondary">
          {open.length} open · {completed.length} done this week
        </Text>

        {todos.length === 0 ? (
          <EmptyState
            title="No todos yet"
            description="Action items from your recorded meetings will show up here automatically."
            ctaLabel="Start your first recording"
            onPressCta={() => router.push("/record/consent")}
          />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerClassName="gap-3 pb-4"
            renderSectionHeader={({ section }) => (
              <Text className="mb-2 mt-2 text-body-sm text-ink-secondary">{section.title}</Text>
            )}
            renderItem={({ item }) => {
              const meetingTitle = item.meetingId ? meetingTitles[item.meetingId] : undefined;
              const subtitle = item.completed
                ? undefined
                : [formatDueLabel(item.dueDate), meetingTitle ? `from ${meetingTitle}` : null]
                    .filter(Boolean)
                    .join(" · ");

              return (
                <TodoItem
                  title={item.text}
                  subtitle={subtitle}
                  completed={item.completed}
                  overdue={isDueSoonOrOverdue(item)}
                  onToggle={() => toggle(item.id)}
                />
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
