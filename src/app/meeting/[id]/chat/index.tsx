import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "react-native";

import { ChatBubble } from "@/components/chat-bubble";
import { ChatInputBar } from "@/components/chat-input-bar";
import { SuggestedQuestionChip } from "@/components/suggested-question-chip";
import { createChatMessage, listChatMessages } from "@/db/queries/chat";
import { getMeeting } from "@/db/queries/meetings";
import { getTranscript } from "@/db/queries/transcripts";
import { generateId } from "@/lib/id";
import { generateChatReply } from "@/services/llm";
import { useSettingsStore } from "@/store/settings";
import { colors } from "@/theme";
import type { ChatMessage, Meeting, Transcript } from "@/types/models";

const SUGGESTED_QUESTIONS = ["What are the risks?", "Summarize in 2 lines"];

export default function MeetingChat() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const activeModelTier = useSettingsStore((state) => state.activeModelTier);

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [meetingData, transcriptData, messagesData] = await Promise.all([
        getMeeting(id),
        getTranscript(id),
        listChatMessages(id),
      ]);
      setMeeting(meetingData);
      setTranscript(transcriptData);
      setMessages(messagesData);
    } catch {
      setError("Failed to load meeting data");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

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

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || generating) return;

    const message: ChatMessage = {
      id: generateId(),
      meetingId: id,
      role: "user",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    const historyForReply = [...messages, message];
    setMessages(historyForReply);
    setDraft("");
    setReplyError(null);
    try {
      await createChatMessage({ id: message.id, meetingId: id, role: "user", text: trimmed });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      // surface error to user here
      return;
    }

    if (!activeModelTier || !transcript?.text) return;

    setGenerating(true);
    try {
      const replyText = await generateChatReply({
        tier: activeModelTier,
        transcriptText: transcript.text,
        meetingTitle: meeting.title,
        history: historyForReply.map((m) => ({ role: m.role, text: m.text })),
      });
      const reply: ChatMessage = {
        id: generateId(),
        meetingId: id,
        role: "assistant",
        text: replyText,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
      await createChatMessage({ id: reply.id, meetingId: id, role: "assistant", text: replyText });
    } catch {
      setReplyError("Couldn't generate a reply. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={12}
      >
        <View className="flex-row items-center gap-3 border-b border-white/10 px-5 pb-4 pt-4">
          <Pressable onPress={() => router.back()} className="h-8 w-8 items-center justify-center">
            <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
          </Pressable>
          <View>
            <Text className="text-h3 text-white">{meeting.title}</Text>
            <Text className="text-body-sm text-ink-secondary">Asking about this meeting only</Text>
          </View>
        </View>

        <ScrollView className="flex-1 px-5" contentContainerClassName="gap-3 py-4">
          {messages.map((message) => (
            <ChatBubble key={message.id} role={message.role} text={message.text} />
          ))}
          {generating ? (
            <View className="max-w-[85%] flex-row items-center gap-2 self-start rounded-2xl bg-ink-surface px-4 py-3">
              <ActivityIndicator size="small" color={colors.ink.textSecondary} />
              <Text className="text-body-lg text-ink-secondary">Thinking…</Text>
            </View>
          ) : null}
        </ScrollView>

        <View className="gap-3 px-5 pb-4">
          {!activeModelTier ? (
            <Pressable
              onPress={() => router.push("/settings/choose-model")}
              className="flex-row items-center gap-2 rounded-2xl bg-ink-surface px-4 py-3 active:opacity-70"
            >
              <Ionicons name="download-outline" size={16} color={colors.ink.textSecondary} />
              <Text className="flex-1 text-body-sm text-ink-secondary">
                Download an on-device model in Settings to get answers.
              </Text>
            </Pressable>
          ) : null}
          {replyError ? <Text className="text-body-sm text-error">{replyError}</Text> : null}
          <View className="flex-row flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((question) => (
              <SuggestedQuestionChip key={question} label={question} onPress={() => sendMessage(question)} />
            ))}
          </View>
          <ChatInputBar value={draft} onChangeText={setDraft} onSend={() => sendMessage(draft)} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
