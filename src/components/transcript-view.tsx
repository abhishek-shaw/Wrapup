import React from "react";
import { Text, View } from "react-native";

import { SummaryCard } from "@/components/summary-card";
import { formatDuration } from "@/lib/format-duration";
import type { TranscriptSegment } from "@/types/models";

type TranscriptViewProps = {
  segments: TranscriptSegment[];
};

export function TranscriptView({ segments }: TranscriptViewProps) {
  if (segments.length === 0) {
    return (
      <SummaryCard label="Transcript">
        <Text className="text-body-lg text-ink-secondary">No speech was detected in this recording.</Text>
      </SummaryCard>
    );
  }

  return (
    <SummaryCard label="Transcript">
      <View className="gap-3">
        {segments.map((segment, index) => (
          <View key={index} className="flex-row gap-3">
            <Text className="w-10 text-caption text-ink-secondary">{formatDuration(segment.startSeconds)}</Text>
            <Text className="flex-1 text-body-lg text-white">{segment.text}</Text>
          </View>
        ))}
      </View>
    </SummaryCard>
  );
}
