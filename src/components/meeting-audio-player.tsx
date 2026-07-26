import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
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
  const trackLayoutRef = useRef<{ x: number; width: number } | null>(null);
  const thumbUnpinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekToFractionRef = useRef(seekToFraction);
  const setDragFractionRef = useRef(setDragFraction);
  const [panHandlers, setPanHandlers] = useState<ReturnType<typeof PanResponder.create>["panHandlers"]>({});

  // One Animated.Value per bar, created once and sprung toward each new real
  // amplitude reading as it arrives — this is what gives the bars their
  // bounce, rather than snapping instantly to each new height. Lazy useState
  // (not useRef) because the values are read during render (JSX below) and
  // the lint config here (react-hooks/refs, from app.json's reactCompiler)
  // disallows reading ref.current at render time.
  const [barAnims] = useState(() => Array.from({ length: WAVEFORM_BAR_COUNT }, () => new Animated.Value(0)));
  // Only read/written inside the effect below (never during render), so this
  // is safe under the react-hooks/refs rule the same way statusRef is in
  // useMeetingAudioPlayback.
  const previousBarsRef = useRef<number[] | null>(null);

  // Create PanResponder once in an effect (not during render) to satisfy
  // react-hooks/refs rule, which flags any ref access inside render-time
  // functions (including lazy useState initializers). Store the panHandlers
  // object in state so it can be spread into JSX without triggering the lint
  // rule's "cannot access refs during render" error.
  useEffect(() => {
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const layout = trackLayoutRef.current;
        if (!layout || layout.width <= 0) return;
        const localX = event.nativeEvent.pageX - layout.x;
        const fraction = clamp01(localX / layout.width);
        setDragFractionRef.current(fraction);
        seekToFractionRef.current(fraction);
      },
      onPanResponderMove: (event) => {
        const layout = trackLayoutRef.current;
        if (!layout || layout.width <= 0) return;
        const localX = event.nativeEvent.pageX - layout.x;
        const fraction = clamp01(localX / layout.width);
        setDragFractionRef.current(fraction);
        seekToFractionRef.current(fraction);
      },
      onPanResponderRelease: (event) => {
        const layout = trackLayoutRef.current;
        if (!layout || layout.width <= 0) return;
        const localX = event.nativeEvent.pageX - layout.x;
        const fraction = clamp01(localX / layout.width);
        setDragFractionRef.current(fraction);
        seekToFractionRef.current(fraction);
        // Keep the thumb pinned to the released position for a beat — the
        // player's status hook updates on its own interval, so clearing this
        // immediately would show the thumb snap backward until it catches up.
        if (thumbUnpinTimeoutRef.current) {
          clearTimeout(thumbUnpinTimeoutRef.current);
        }
        thumbUnpinTimeoutRef.current = setTimeout(() => setDragFractionRef.current(null), 300);
      },
      onPanResponderTerminate: () => {
        if (thumbUnpinTimeoutRef.current) {
          clearTimeout(thumbUnpinTimeoutRef.current);
        }
        setDragFractionRef.current(null);
      },
    });
    setPanHandlers(responder.panHandlers);
  }, []);

  useEffect(() => {
    const previous = previousBarsRef.current;
    waveformBars.forEach((value, index) => {
      if (previous && previous[index] === value) return; // unchanged — don't restart its spring
      Animated.spring(barAnims[index], {
        toValue: value,
        useNativeDriver: false,
        speed: 20,
        bounciness: 12,
      }).start();
    });
    previousBarsRef.current = waveformBars;
  }, [waveformBars, barAnims]);

  // Keep the refs updated with the latest callback values so the PanResponder
  // (created once in the effect above) always calls the current versions.
  useEffect(() => {
    seekToFractionRef.current = seekToFraction;
    setDragFractionRef.current = setDragFraction;
  }, [seekToFraction, setDragFraction]);

  useEffect(() => {
    return () => {
      if (thumbUnpinTimeoutRef.current) {
        clearTimeout(thumbUnpinTimeoutRef.current);
      }
    };
  }, []);

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
            accessibilityLabel={isPlaying ? "Pause" : "Play"}
            className="h-12 w-12 items-center justify-center rounded-full bg-amber active:opacity-80 disabled:opacity-50"
          >
            <Ionicons name={isPlaying ? "pause" : "play"} size={20} color={colors.mascot.features} />
          </Pressable>

          <View className="flex-1 gap-2">
            <View
              {...panHandlers}
              onLayout={(event: LayoutChangeEvent) => {
                const { width } = event.nativeEvent.layout;
                setTrackWidth(width);
                // Capture pageX via measure() for absolute screen coordinates
                event.currentTarget.measure((fx, fy, w, h, px) => {
                  trackLayoutRef.current = { x: px, width: w };
                });
              }}
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
