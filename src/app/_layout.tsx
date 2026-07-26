import "../../global.css";

import {
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
} from "@expo-google-fonts/nunito";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";

import { PersistentRecordingBanner } from "@/components/recording-indicator";
import { getDb } from "@/db/client";
import { seedDevData } from "@/db/seed";
import { useSettingsStore } from "@/store/settings";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  const [dbReady, setDbReady] = useState(false);
  const onboardingComplete = useSettingsStore((state) => state.onboardingComplete);
  const loadOnboardingStatus = useSettingsStore((state) => state.loadOnboardingStatus);

  useEffect(() => {
    getDb()
      .then(() => seedDevData())
      .then(() => setDbReady(true));
    loadOnboardingStatus();
  }, [loadOnboardingStatus]);

  const ready = (fontsLoaded || !!fontError) && dbReady && onboardingComplete !== null;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <PersistentRecordingBanner />
    </>
  );
}
