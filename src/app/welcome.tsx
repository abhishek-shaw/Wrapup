import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

import { images } from "@/constants/images";
import { colors } from "@/theme";

export default function Welcome() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 justify-between px-8 pb-8 pt-10">
        <View className="items-center">
          <Image source={images.mascotLogo} style={{ width: 128, height: 128 }} contentFit="contain" />

          <Text className="mt-6 text-display text-amber">Wrapup</Text>

          <View className="mt-10 items-center gap-8">
            <Text className="text-center text-headline text-white">
              Your conversations.{"\n"}
              <Text className="text-deep-amber">Private.</Text>
            </Text>
            <Text className="text-center text-headline text-white">
              Your intelligence.{"\n"}
              <Text className="text-deep-amber">Powerful.</Text>
            </Text>
            <Text className="text-center text-headline text-white">
              Your device.{"\n"}
              <Text className="text-deep-amber">Always.</Text>
            </Text>
          </View>

          <Text className="mt-10 max-w-80 text-center text-body-lg text-ink-secondary">
            Wrapup listens, transcribes, and summarizes your meetings entirely on your phone.
            Nothing is ever sent anywhere.
          </Text>
        </View>

        <View className="gap-4">
          <Pressable
            onPress={() => router.back()}
            className="h-14 items-center justify-center rounded-2xl bg-amber active:opacity-80"
          >
            <Text className="text-h3 text-mascot-features">Get started</Text>
          </Pressable>
          <Text className="text-center text-caption text-text-secondary">
            No account. No sign-up. Just your device.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
