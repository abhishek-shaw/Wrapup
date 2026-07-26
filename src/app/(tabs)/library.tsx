import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SafeAreaView, SectionList, Text, TextInput, View } from "react-native";

import { EmptyState } from "@/components/empty-state";
import { RecordingListItem } from "@/components/recording-list-item";
import { listMeetingsWithPreview } from "@/db/queries/meetings";
import { searchMeetingIds } from "@/db/queries/search";
import { colors } from "@/theme";
import type { Meeting } from "@/types/models";

type LibraryMeeting = Meeting & { previewText: string | null };

function monthLabel(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function dateLabel(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffDays = Math.round((now.setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function Library() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [meetings, setMeetings] = useState<LibraryMeeting[] | null>(null);
  const [matchingIds, setMatchingIds] = useState<Set<string> | null>(null);

  useFocusEffect(
    useCallback(() => {
      // Include processing/failed meetings too, not just ready ones — otherwise
      // a meeting that never finished transcribing (app killed mid-processing, a
      // transcribe error) only ever shows up in Today, and only on the day it was
      // recorded. Library is the one place a stuck recording stays reachable
      // regardless of how much time has passed.
      listMeetingsWithPreview().then((all) => setMeetings(all.filter((meeting) => meeting.status !== "recording")));
    }, []),
  );

  useEffect(() => {
    let cancelled = false;
    searchMeetingIds(query).then((ids) => {
      if (cancelled) return;
      setMatchingIds(query.trim() ? new Set(ids) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const sections = useMemo(() => {
    if (!meetings) return [];
    const filtered = matchingIds ? meetings.filter((meeting) => matchingIds.has(meeting.id)) : meetings;

    const months = Array.from(new Set(filtered.map((meeting) => monthLabel(meeting.startedAt))));
    return months.map((month) => ({
      title: month,
      data: filtered.filter((meeting) => monthLabel(meeting.startedAt) === month),
    }));
  }, [meetings, matchingIds]);

  if (!meetings) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ink.background }}>
      <View className="flex-1 px-5 pt-4">
        <Text className="mb-4 text-h1 text-white">All recordings</Text>

        <View className="mb-5 flex-row items-center gap-2 rounded-2xl bg-ink-surface px-4 py-3">
          <Ionicons name="search-outline" size={18} color={colors.ink.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search recordings and transcripts"
            placeholderTextColor={colors.ink.textSecondary}
            className="flex-1 text-body-lg text-white"
          />
        </View>

        {meetings.length === 0 ? (
          <EmptyState
            title="No recordings yet"
            description="Start recording a meeting or dictation and it'll show up here, summarized and ready."
            ctaLabel="Start your first recording"
            onPressCta={() => router.push("/record/consent")}
          />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            contentContainerClassName="gap-3 pb-4"
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) => (
              <Text className="mb-2 mt-2 text-body-sm text-ink-secondary">{section.title}</Text>
            )}
            renderItem={({ item }) => {
              const needsRetry = item.status === "processing" || item.status === "failed";
              return (
                <RecordingListItem
                  title={item.title}
                  subtitle={
                    item.previewText
                      ? `${dateLabel(item.startedAt)} · ${item.previewText}`
                      : dateLabel(item.startedAt)
                  }
                  icon={item.source === "manual_dictation" ? "mic" : "people"}
                  badge={
                    item.status === "failed"
                      ? { label: "Failed — tap to retry", variant: "failed" }
                      : item.status === "processing"
                        ? { label: "Processing", variant: "processing" }
                        : undefined
                  }
                  onPress={() =>
                    router.push(needsRetry ? `/record/processing?id=${item.id}` : `/meeting/${item.id}`)
                  }
                />
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
