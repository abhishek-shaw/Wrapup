import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";

import { MeetingAudioPlayer } from "@/components/meeting-audio-player";
import { SummaryCard } from "@/components/summary-card";
import { TodoItem } from "@/components/todo-item";
import { TranscriptView } from "@/components/transcript-view";
import { deleteMeeting, getMeeting, updateMeetingStatus, updateMeetingTitle } from "@/db/queries/meetings";
import { removeMeetingFromIndex, updateSearchTitle } from "@/db/queries/search";
import { getSummary } from "@/db/queries/summaries";
import { deleteTodosForMeeting } from "@/db/queries/todos";
import { getTranscript } from "@/db/queries/transcripts";
import { deleteAudioFile } from "@/services/recording";
import { useTodosStore } from "@/store/todos";
import { colors } from "@/theme";
import type { Meeting, Summary, Transcript } from "@/types/models";

export default function MeetingSummary() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const allTodos = useTodosStore((state) => state.todos);
  const loadTodos = useTodosStore((state) => state.load);
  const toggleTodo = useTodosStore((state) => state.toggle);
  const actionItems = allTodos.filter((todo) => todo.meetingId === id);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [meetingData, summaryData, transcriptData] = await Promise.all([
        getMeeting(id),
        getSummary(id),
        getTranscript(id),
      ]);
      setMeeting(meetingData);
      setSummary(summaryData);
      setTranscript(transcriptData);
      await loadTodos();
    } catch {
      setError("Failed to load meeting data");
    }
  }, [id, loadTodos]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const handleReprocess = () => {
    const start = async () => {
      await updateMeetingStatus(id, "processing");
      router.push(`/record/processing?id=${id}`);
    };
    // Only warn about losing progress when there's actually completed work
    // at stake — the common case this button exists for (summary generated,
    // action items missing) has nothing to lose, so skip the extra tap.
    if (actionItems.some((item) => item.completed)) {
      Alert.alert(
        "Reprocess this recording?",
        "This regenerates the summary and action items from the original audio, replacing the current ones — including any action items you've already checked off.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Reprocess", style: "destructive", onPress: () => start() },
        ],
      );
    } else {
      start();
    }
  };

  if (meeting === undefined) return null;

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-h2 text-white">Error loading meeting</Text>
          <Text className="text-center text-body-lg text-ink-secondary">{error}</Text>
          <Pressable
            onPress={() => loadData()}
            className="h-12 items-center justify-center rounded-2xl bg-amber px-6 active:opacity-80"
          >
            <Text className="text-h3 text-mascot-features">Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

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

  const startEditingTitle = () => {
    setTitleDraft(meeting.title);
    setIsEditingTitle(true);
  };

  const handleSaveTitle = async () => {
    setIsEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === meeting.title) return;
    setMeeting({ ...meeting, title: trimmed });
    await updateMeetingTitle(meeting.id, trimmed);
    await updateSearchTitle(meeting.id, trimmed);
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete this recording?",
      "This permanently deletes the recording, its transcript, summary, and action items. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (meeting.audioFilePath) deleteAudioFile(meeting.audioFilePath);
            await deleteTodosForMeeting(meeting.id);
            await removeMeetingFromIndex(meeting.id);
            await deleteMeeting(meeting.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <ScrollView className="flex-1 px-5 pt-4" contentContainerClassName="gap-4 pb-4">
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} className="h-8 w-8 items-center justify-center">
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={handleDelete} className="h-8 w-8 items-center justify-center">
            <Ionicons name="trash-outline" size={20} color={colors.semantic.error} />
          </Pressable>
        </View>

        <View className="gap-1">
          <Text className="text-body-sm text-ink-secondary">
            {dateLabel} · {timeLabel}
            {meeting.attendeeCount ? ` · ${meeting.attendeeCount} people` : ""}
          </Text>
          {isEditingTitle ? (
            <TextInput
              value={titleDraft}
              onChangeText={setTitleDraft}
              onSubmitEditing={handleSaveTitle}
              onBlur={handleSaveTitle}
              autoFocus
              returnKeyType="done"
              className="text-h1 text-white"
              style={{ padding: 0 }}
            />
          ) : (
            <Pressable onPress={startEditingTitle} className="flex-row items-center gap-2 self-start">
              <Text className="text-h1 text-white">{meeting.title}</Text>
              <Ionicons name="pencil" size={16} color={colors.ink.textSecondary} />
            </Pressable>
          )}
        </View>

        {meeting.audioFilePath ? (
          <Pressable onPress={handleReprocess} className="flex-row items-center gap-2 self-start active:opacity-70">
            <Ionicons name="refresh" size={16} color={colors.ink.textSecondary} />
            <Text className="text-body-sm text-ink-secondary">Reprocess recording</Text>
          </Pressable>
        ) : null}

        {meeting.audioFilePath ? <MeetingAudioPlayer audioFilePath={meeting.audioFilePath} /> : null}

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

        {transcript ? <TranscriptView segments={transcript.segments ?? []} /> : null}

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
