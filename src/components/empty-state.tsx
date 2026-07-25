import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { images } from "@/constants/images";

type EmptyStateProps = {
  title: string;
  description: string;
  ctaLabel: string;
  onPressCta: () => void;
};

export function EmptyState({ title, description, ctaLabel, onPressCta }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-6 px-8">
      <Image source={images.mascotLogo} style={{ width: 96, height: 96 }} contentFit="contain" />
      <View className="gap-2">
        <Text className="text-center text-h2 text-white">{title}</Text>
        <Text className="text-center text-body-lg text-ink-secondary">{description}</Text>
      </View>
      <Pressable
        onPress={onPressCta}
        className="h-12 flex-row items-center gap-2 rounded-2xl bg-amber px-6 active:opacity-80"
      >
        <Ionicons name="mic-outline" size={18} color="#3D2A16" />
        <Text className="text-h3 text-mascot-features">{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}
