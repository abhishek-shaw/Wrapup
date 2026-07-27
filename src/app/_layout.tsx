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

import { PersistentModelDownloadBanner } from "@/components/model-download-indicator";
import { PersistentRecordingBanner } from "@/components/recording-indicator";
import { getDb } from "@/db/client";
import { seedDevData } from "@/db/seed";
import { useModelDownloadStore } from "@/store/modelDownload";
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
    // Picks up a download that was paused (by the user, or by this app going
    // to background) before it got killed — see store/modelDownload.ts.
    useModelDownloadStore.getState().restorePendingDownload();
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
      <PersistentModelDownloadBanner />
    </>
  );
}
