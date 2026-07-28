import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@/components/empty-state";
import { EventCard } from "@/components/event-card";
import { images } from "@/constants/images";
import { listMeetings } from "@/db/queries/meetings";
import { getEventsForToday, type CalendarEventInfo } from "@/services/calendar";
import { isLikelyMeeting } from "@/services/calendar/heuristic";
import { useSettingsStore } from "@/store/settings";
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
        : meeting.status === "failed"
          ? ({ label: "Failed — tap to retry", variant: "failed" } as const)
          : meeting.status === "recording" || meeting.status === "processing"
            ? ({ label: "Processing", variant: "upcoming" } as const)
            : undefined,
  };
}

function describeCalendarEvent(event: CalendarEventInfo, isMeeting: boolean) {
  const time = new Date(event.startDate).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return {
    subtitle: event.attendeeCount ? `${time} · ${event.attendeeCount} people` : time,
    badge: isMeeting ? ({ label: "Record", variant: "pending" } as const) : undefined,
  };
}

type TodayItem =
  | { kind: "meeting"; key: string; time: string; meeting: Meeting }
  | { kind: "pending"; key: string; time: string; event: CalendarEventInfo };

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

export default function Today() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventInfo[]>([]);
  const calendarConnected = useSettingsStore((state) => state.calendarConnected);
  const loadCalendarStatus = useSettingsStore((state) => state.loadCalendarStatus);
  const connectCalendar = useSettingsStore((state) => state.connectCalendar);

  const refresh = useCallback(async () => {
    await loadCalendarStatus();
    const granted = useSettingsStore.getState().calendarConnected;
    const [allMeetings, events] = await Promise.all([
      listMeetings(),
      granted ? getEventsForToday() : Promise.resolve([]),
    ]);
    setMeetings(allMeetings.filter((meeting) => isToday(meeting.startedAt)));
    setCalendarEvents(events.filter((event) => isToday(event.startDate)));
  }, [loadCalendarStatus]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (!meetings) return null;

  const recordedEventIds = new Set(
    meetings.filter((meeting) => meeting.calendarEventId).map((meeting) => meeting.calendarEventId as string),
  );

  const items: TodayItem[] = [
    ...meetings.map((meeting) => ({ kind: "meeting" as const, key: meeting.id, time: meeting.startedAt, meeting })),
    ...calendarEvents
      .filter((event) => !recordedEventIds.has(event.id))
      .map((event) => ({ kind: "pending" as const, key: event.id, time: event.startDate, event })),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

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

        {calendarConnected === false ? (
          <Pressable
            onPress={async () => {
              await connectCalendar();
              refresh();
            }}
            className="mb-4 flex-row items-center gap-3 rounded-2xl bg-ink-surface p-4 active:opacity-80"
          >
            <Ionicons name="calendar-outline" size={18} color={colors.primary.amber} />
            <Text className="flex-1 text-body-sm text-ink-secondary">
              Connect your calendar to see today&apos;s meetings here.
            </Text>
            <Text className="text-body-sm font-semibold text-amber">Connect</Text>
          </Pressable>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            title="No recordings yet"
            description="Start recording a meeting or dictation and it'll show up here, summarized and ready."
            ctaLabel="Start your first recording"
            onPressCta={() => router.push("/record/consent")}
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.key}
            contentContainerClassName="gap-3 pb-4"
            renderItem={({ item }) => {
              if (item.kind === "meeting") {
                const { subtitle, badge } = describeMeeting(item.meeting);
                // A meeting that never finished processing (app killed mid-transcription,
                // a transcribe error, etc.) has no summary/transcript to show on the detail
                // screen — send it back to the processing screen instead, which retries
                // transcription from scratch on mount rather than leaving it stuck forever.
                const needsRetry = item.meeting.status === "processing" || item.meeting.status === "failed";
                return (
                  <Pressable
                    onPress={() =>
                      router.push(
                        needsRetry ? `/record/processing?id=${item.meeting.id}` : `/meeting/${item.meeting.id}`,
                      )
                    }
                  >
                    <EventCard
                      title={item.meeting.title}
                      subtitle={subtitle}
                      isMeeting={item.meeting.source === "calendar_meeting"}
                      badge={badge}
                    />
                  </Pressable>
                );
              }

              const isMeeting = isLikelyMeeting(item.event);
              const { subtitle, badge } = describeCalendarEvent(item.event, isMeeting);
              return (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/record/consent",
                      params: { title: item.event.title, calendarEventId: item.event.id, source: "calendar_meeting" },
                    })
                  }
                >
                  <EventCard title={item.event.title} subtitle={subtitle} isMeeting={isMeeting} badge={badge} />
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
