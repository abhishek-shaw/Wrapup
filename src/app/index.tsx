import { Redirect } from "expo-router";
import React from "react";

import { useSettingsStore } from "@/store/settings";

export default function Index() {
  const onboardingComplete = useSettingsStore((state) => state.onboardingComplete);

  return <Redirect href={onboardingComplete ? "/today" : "/welcome"} />;
}
