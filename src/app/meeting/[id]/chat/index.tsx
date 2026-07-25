import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";

import { ChatBubble } from "@/components/chat-bubble";
import { ChatInputBar } from "@/components/chat-input-bar";
import { SuggestedQuestionChip } from "@/components/suggested-question-chip";
import { createChatMessage, listChatMessages } from "@/db/queries/chat";
import { getMeeting } from "@/db/queries/meetings";
import { generateId } from "@/lib/id";
import { colors } from "@/theme";
import type { ChatMessage, Meeting } from "@/types/models";

const SUGGESTED_QUESTIONS = ["What are the risks?", "Summarize in 2 lines"];

export default function MeetingChat() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  useFocusEffect(
    useCallback(() => {
      getMeeting(id).then(setMeeting);
      listChatMessages(id).then(setMessages);
    }, [id]),
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

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const message: ChatMessage = {
      id: generateId(),
      meetingId: id,
      role: "user",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, message]);
    setDraft("");
    await createChatMessage({ id: message.id, meetingId: id, role: "user", text: trimmed });
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
        </ScrollView>

        <View className="gap-3 px-5 pb-4">
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
