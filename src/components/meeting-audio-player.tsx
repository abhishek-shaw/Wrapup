import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Animated, PanResponder, Pressable, Text, View, type LayoutChangeEvent } from "react-native";

import { SummaryCard } from "@/components/summary-card";
import { formatDuration } from "@/lib/format-duration";
import { useMeetingAudioPlayback, WAVEFORM_BAR_COUNT } from "@/services/recording";
import { colors } from "@/theme";

const WAVEFORM_HEIGHT = 32;
const THUMB_SIZE = 16;
const THUMB_VERTICAL_OFFSET = 12; // nudges the thumb down from dead-center, so it sits slightly below the bar tops

type MeetingAudioPlayerProps = {
  audioFilePath: string;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Playback controls for a meeting's recorded audio. The waveform doubles as
 * a scrubber: bars spring to each new amplitude reading as it's revealed
 * during playback (see useMeetingAudioPlayback), and a draggable circular
 * thumb — vertically centered over the track, WhatsApp-voice-note style —
 * sits on top so the user can grab it and drag to any point in time. Tapping
 * anywhere on the track jumps straight there, same as dragging directly to
 * that spot. Shown on the meeting detail screen only when the meeting
 * actually has a saved audio file. */
export function MeetingAudioPlayer({ audioFilePath }: MeetingAudioPlayerProps) {
  const {
    isLoaded,
    isPlaying,
    positionSeconds,
    durationSeconds,
    error,
    togglePlayback,
    seekToFraction,
    waveformBars,
    playedBarCount,
  } = useMeetingAudioPlayback(audioFilePath);

  const [trackWidth, setTrackWidth] = useState(0);
  const [dragFraction, setDragFraction] = useState<number | null>(null);

  // One Animated.Value per bar, created once and sprung toward each new real
  // amplitude reading as it arrives — this is what gives the bars their
  // bounce, rather than snapping instantly to each new height. Lazy useState
  // (not useRef) because the values are read during render (JSX below) and
  // the lint config here (react-hooks/refs, from app.json's reactCompiler)
  // disallows reading ref.current at render time.
  const [barAnims] = useState(() => Array.from({ length: WAVEFORM_BAR_COUNT }, () => new Animated.Value(0)));

  useEffect(() => {
    waveformBars.forEach((value, index) => {
      Animated.spring(barAnims[index], {
        toValue: value,
        useNativeDriver: false,
        speed: 20,
        bounciness: 12,
      }).start();
    });
  }, [waveformBars, barAnims]);

  const handleTrackTouch = (locationX: number) => {
    if (trackWidth <= 0) return;
    const fraction = clamp01(locationX / trackWidth);
    setDragFraction(fraction);
    seekToFraction(fraction);
  };

  // Rebuilt every render (cheap — a plain object of callback bindings, no
  // native resources) so it always closes over the current render's
  // `handleTrackTouch`/`trackWidth`/`seekToFraction`. RN's responder system
  // just reads whichever `panHandlers` props are current when a touch event
  // fires, the same as any other event-handler prop, so there's no need to
  // keep one stable instance across renders — and no ref access, which the
  // react-hooks/refs rule (from app.json's reactCompiler) disallows inside a
  // function built during render.
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => handleTrackTouch(event.nativeEvent.locationX),
    onPanResponderMove: (event) => handleTrackTouch(event.nativeEvent.locationX),
    onPanResponderRelease: (event) => {
      handleTrackTouch(event.nativeEvent.locationX);
      // Keep the thumb pinned to the released position for a beat — the
      // player's status hook updates on its own interval, so clearing this
      // immediately would show the thumb snap backward until it catches up.
      setTimeout(() => setDragFraction(null), 300);
    },
    onPanResponderTerminate: () => setDragFraction(null),
  });

  const playbackFraction = durationSeconds > 0 ? clamp01(positionSeconds / durationSeconds) : 0;
  const thumbFraction = dragFraction ?? playbackFraction;
  const effectivePlayedBarCount =
    dragFraction !== null ? Math.round(dragFraction * WAVEFORM_BAR_COUNT) : playedBarCount;
  const thumbLeft = thumbFraction * trackWidth - THUMB_SIZE / 2;

  return (
    <SummaryCard label="Recording">
      {error ? (
        <Text className="text-body-md text-ink-secondary">Couldn&apos;t load this recording&apos;s audio.</Text>
      ) : (
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={togglePlayback}
            disabled={!isLoaded}
            className="h-12 w-12 items-center justify-center rounded-full bg-amber active:opacity-80 disabled:opacity-50"
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={20} color={colors.mascot.features} />
          </Pressable>

          <View className="flex-1 gap-2">
            <View
              {...panResponder.panHandlers}
              onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
              hitSlop={{ top: 10, bottom: 10 }}
              style={{ height: WAVEFORM_HEIGHT, justifyContent: "center" }}
            >
              <View className="flex-row items-end gap-px" style={{ height: WAVEFORM_HEIGHT }}>
                {waveformBars.map((_, index) => (
                  <Animated.View
                    key={index}
                    className="flex-1 rounded-full"
                    style={{
                      height: barAnims[index].interpolate({
                        inputRange: [0, 1],
                        outputRange: [3, WAVEFORM_HEIGHT],
                        extrapolate: "clamp",
                      }),
                      backgroundColor:
                        index < effectivePlayedBarCount ? colors.primary.amber : "rgba(255,255,255,0.2)",
                    }}
                  />
                ))}
              </View>

              {trackWidth > 0 ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: thumbLeft,
                    top: (WAVEFORM_HEIGHT - THUMB_SIZE) / 2 + THUMB_VERTICAL_OFFSET,
                    width: THUMB_SIZE,
                    height: THUMB_SIZE,
                    borderRadius: THUMB_SIZE / 2,
                    backgroundColor: colors.primary.cream,
                    borderWidth: 2,
                    borderColor: colors.primary.amber,
                  }}
                />
              ) : null}
            </View>

            <View className="flex-row justify-between">
              <Text className="text-caption text-ink-secondary">
                {formatDuration(Math.floor(positionSeconds))}
              </Text>
              <Text className="text-caption text-ink-secondary">
                {formatDuration(Math.floor(durationSeconds))}
              </Text>
            </View>
          </View>
        </View>
      )}
    </SummaryCard>
  );
}
