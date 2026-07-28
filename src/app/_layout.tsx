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
import { Platform, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { PersistentModelDownloadBanner } from "@/components/model-download-indicator";
import { PersistentRecordingBanner } from "@/components/recording-indicator";
import { getDb } from "@/db/client";
import { seedDevData } from "@/db/seed";
import { useModelDownloadStore } from "@/store/modelDownload";
import { useRecordingStore } from "@/store/recording";
import { useSettingsStore } from "@/store/settings";

SplashScreen.preventAutoHideAsync();

/** Stacks the recording and download banners so they never overlap when
 * both are active simultaneously. The recording indicator must always be
 * unambiguous (AGENTS.md), so it takes visual priority: recording banner
 * first, download banner offset below it if needed. */
function BannerContainer() {
  const recordingState = useRecordingStore((state) => state.recordingState);
  const activeMeetingId = useRecordingStore((state) => state.activeMeetingId);
  const activeDownload = useModelDownloadStore((state) => state.activeDownload);

  const showRecordingBanner = recordingState !== "idle" && activeMeetingId !== null;
  const showDownloadBanner = activeDownload !== null && activeDownload.phase !== "done";

  if (!showRecordingBanner && !showDownloadBanner) return null;

  return (
    <SafeAreaView
      pointerEvents="box-none"
      style={{ position: "absolute", top: 0, left: 0, right: 0 }}
    >
      <View
        className="items-center"
        style={{
          paddingTop: Platform.OS === "android" ? 16 : 8,
          gap: 8,
        }}
      >
        <PersistentRecordingBanner />
        <PersistentModelDownloadBanner />
      </View>
    </SafeAreaView>
  );
}

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
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <BannerContainer />
    </SafeAreaProvider>
  );
}
