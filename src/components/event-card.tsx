import React from "react";
import { Text, View } from "react-native";

type EventBadge = {
  label: string;
  variant: "recorded" | "upcoming";
};

type EventCardProps = {
  title: string;
  subtitle: string;
  /** True for calendar events detected as meetings; false for personal
   * calendar events or manual dictations with no linked meeting. */
  isMeeting?: boolean;
  badge?: EventBadge;
};

const BADGE_CLASSNAMES: Record<EventBadge["variant"], string> = {
  recorded: "bg-cream",
  upcoming: "bg-coral/20",
};

const BADGE_TEXT_CLASSNAMES: Record<EventBadge["variant"], string> = {
  recorded: "text-deep-amber",
  upcoming: "text-coral",
};

export function EventCard({ title, subtitle, isMeeting, badge }: EventCardProps) {
  return (
    <View className="flex-row items-stretch gap-3 rounded-2xl bg-ink-surface p-4">
      <View className={`w-1 rounded-full ${isMeeting ? "bg-amber" : "bg-white/20"}`} />
      <View className="flex-1 justify-center gap-1">
        <Text className="text-h3 text-white">{title}</Text>
        <Text className="text-body-sm text-ink-secondary">{subtitle}</Text>
      </View>
      {badge ? (
        <View className={`self-center rounded-full px-3 py-1.5 ${BADGE_CLASSNAMES[badge.variant]}`}>
          <Text className={`text-caption font-semibold ${BADGE_TEXT_CLASSNAMES[badge.variant]}`}>
            {badge.label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
