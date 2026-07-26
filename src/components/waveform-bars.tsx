import React, { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";

type WaveformBarsProps = {
  /** Normalized 0-1 amplitude per bar, fixed-size. */
  values: number[];
  /** How many leading bars count as "played"/"active" and get `activeColor`. */
  activeCount: number;
  height: number;
  activeColor: string;
  inactiveColor: string;
};

/**
 * Renders a row of bars that spring toward each new amplitude reading as it
 * arrives, rather than snapping instantly — this is what gives the bars
 * their bounce. Shared by the meeting playback scrubber
 * (MeetingAudioPlayer) and the live recording level meter
 * (record/progress.tsx), so both bounce identically.
 */
export function WaveformBars({ values, activeCount, height, activeColor, inactiveColor }: WaveformBarsProps) {
  // One Animated.Value per bar, created once and sprung toward each new
  // value — lazy useState (not useRef) because the values are read during
  // render and this project's react-hooks/refs lint rule disallows reading
  // ref.current at render time.
  const [barAnims] = useState(() => values.map(() => new Animated.Value(0)));
  const previousValuesRef = useRef<number[] | null>(null);

  useEffect(() => {
    const previous = previousValuesRef.current;
    values.forEach((value, index) => {
      if (previous && previous[index] === value) return; // unchanged — don't restart its spring
      Animated.spring(barAnims[index], {
        toValue: value,
        useNativeDriver: false,
        speed: 20,
        bounciness: 12,
      }).start();
    });
    previousValuesRef.current = values;
  }, [values, barAnims]);

  return (
    <View className="flex-row items-end gap-px" style={{ height }}>
      {barAnims.map((anim, index) => (
        <Animated.View
          key={index}
          className="flex-1 rounded-full"
          style={{
            height: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [3, height],
              extrapolate: "clamp",
            }),
            backgroundColor: index < activeCount ? activeColor : inactiveColor,
          }}
        />
      ))}
    </View>
  );
}
