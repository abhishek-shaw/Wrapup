import React from "react";
import { Text, View } from "react-native";

type ChatBubbleProps = {
  role: "user" | "assistant";
  text: string;
};

export function ChatBubble({ role, text }: ChatBubbleProps) {
  const isUser = role === "user";
  return (
    <View
      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
        isUser ? "self-end bg-amber" : "self-start bg-ink-surface"
      }`}
    >
      <Text className={`text-body-lg ${isUser ? "text-mascot-features" : "text-white"}`}>{text}</Text>
    </View>
  );
}
