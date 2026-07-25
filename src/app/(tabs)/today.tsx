import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, SafeAreaView, Text, View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { EventCard } from "@/components/event-card";
import { images } from "@/constants/images";
import { listMeetings } from "@/db/queries/meetings";
import { colors } from "@/theme";
import type { Meeting } from "@/types/models";

function isToday(isoDate: string): boolean {
  const date = new Date(isoDate);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function describeMeeting(meeting: Meeting) {
  const time = new Date(meeting.startedAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return {
    subtitle:
      meeting.source === "manual_dictation"
        ? `Recorded manually · ${time}`
        : meeting.attendeeCount
          ? `${time} · ${meeting.attendeeCount} people`
          : time,
    badge:
      meeting.status === "ready"
        ? ({ label: "Recorded", variant: "recorded" } as const)
        : meeting.status === "recording" || meeting.status === "processing"
          ? ({ label: "Processing", variant: "upcoming" } as const)
          : undefined,
  };
}

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export default function Today() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listMeetings().then((all) => setMeetings(all.filter((meeting) => isToday(meeting.startedAt))));
    }, []),
  );

  if (!meetings) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 px-5 pt-4">
        <View className="mb-6 flex-row items-center justify-between">
          <View>
            <Text className="text-body-sm text-ink-secondary">{TODAY_LABEL}</Text>
            <Text className="text-h1 text-white">Today</Text>
          </View>
          <View className="h-11 w-11 items-center justify-center rounded-full bg-cream">
            <Image source={images.mascotLogo} style={{ width: 26, height: 26 }} contentFit="contain" />
          </View>
        </View>

        {meetings.length === 0 ? (
          <EmptyState
            title="No recordings yet"
            description="Start recording a meeting or dictation and it'll show up here, summarized and ready."
            ctaLabel="Start your first recording"
            onPressCta={() => router.push("/record/consent")}
          />
        ) : (
          <FlatList
            data={meetings}
            keyExtractor={(item) => item.id}
            contentContainerClassName="gap-3 pb-4"
            renderItem={({ item }) => {
              const { subtitle, badge } = describeMeeting(item);
              return (
                <Pressable onPress={() => router.push(`/meeting/${item.id}`)}>
                  <EventCard
                    title={item.title}
                    subtitle={subtitle}
                    isMeeting={item.source === "calendar_meeting"}
                    badge={badge}
                  />
                </Pressable>
              );
            }}
          />
        )}

        <Pressable
          onPress={() => router.push("/record/consent")}
          className="mb-4 h-14 flex-row items-center justify-center gap-2 rounded-2xl bg-amber active:opacity-80"
        >
          <Ionicons name="mic-outline" size={20} color={colors.mascot.features} />
          <Text className="text-h3 text-mascot-features">Start recording</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
