/**
 * expo-audio wrapper — the only place in the app that talks to `expo-audio`
 * directly. See AGENTS.md: native module boundaries get a typed wrapper in
 * services/, not ad hoc calls from components. Covers both capture (for the
 * record flow) and playback (for replaying a meeting's saved recording).
 *
 * The recorder is a module-level singleton rather than a React hook
 * (`useAudioRecorder`) on purpose: that hook releases its native recorder
 * when the owning component unmounts, which would kill an in-progress
 * recording the moment the user navigates away from the progress screen.
 * Keeping it here lets capture survive screen navigation and backgrounding
 * (see the `enableBackgroundRecording` config plugin option in app.json),
 * which is what the persistent recording indicator relies on. Playback has
 * no such requirement, so `useMeetingAudioPlayback` below uses expo-audio's
 * own hooks directly, scoped to the screen that's playing it back.
 *
 * This pipeline only ever reads/writes local disk — see AGENTS.md Privacy &
 * Network Rules. No function in this file makes a network call.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  getRecordingPermissionsAsync,
  requestNotificationPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioSampleListener,
  type RecorderState,
  type RecordingOptions,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Device from "expo-device";

// The iOS Simulator's AudioQueue can't initialize a hardware AAC encoder for
// recording input at all — it fails immediately with "AudioCodecInitialize
// failed" regardless of settings. This is a Simulator-only limitation (real
// iPhones/iPads are unaffected); fall back to uncompressed Linear PCM there
// so the record flow is still testable without a physical device. Device
// and production builds are untouched.
const IS_IOS_SIMULATOR = Platform.OS === "ios" && !Device.isDevice;

// Mono/16kHz keeps files small and matches the sample rate on-device ASR
// (whisper.rn) expects, while still sounding clear for a single-room meeting.
// Stored in the document directory, not cache — this is irreplaceable user
// audio, not a re-downloadable asset like the model files are.
const RECORDING_OPTIONS: RecordingOptions = {
  extension: IS_IOS_SIMULATOR ? ".wav" : ".m4a",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  directory: "document",
  isMeteringEnabled: true,
  android: {
    outputFormat: "mpeg4",
    audioEncoder: "aac",
  },
  ios: {
    outputFormat: IS_IOS_SIMULATOR ? IOSOutputFormat.LINEARPCM : IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: "audio/webm",
    bitsPerSecond: 64000,
  },
};

let activeRecorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null;

export async function getMicrophonePermissionStatus(): Promise<boolean> {
  const { granted } = await getRecordingPermissionsAsync();
  return granted;
}

/**
 * Requests everything capture needs before `startCapture()` is called.
 * Background recording (`enableBackgroundRecording`, see app.json) runs as a
 * foreground service on Android, which requires a visible notification —
 * so Android 13+ also requires POST_NOTIFICATIONS granted up front, or
 * `prepareToRecordAsync()` rejects with ERR_NOTIFICATION_PERMISSIONS.
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  const { granted } = await requestRecordingPermissionsAsync();
  if (!granted) return false;

  if (Platform.OS === "android") {
    const { granted: notificationsGranted } = await requestNotificationPermissionsAsync();
    return notificationsGranted;
  }

  return true;
}

export function isCapturing(): boolean {
  return activeRecorder !== null;
}

/** Starts capturing microphone audio to a local file. Throws if a capture is already in progress. */
export async function startCapture(): Promise<void> {
  if (activeRecorder) {
    throw new Error("A recording is already in progress");
  }

  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    allowsBackgroundRecording: true,
    interruptionMode: "doNotMix",
  });

  // AudioModule is a native module instance (not a static export list), same
  // pattern expo-audio's own useAudioRecorder hook uses internally.
  // eslint-disable-next-line import/namespace
  const recorder = new AudioModule.AudioRecorder(RECORDING_OPTIONS);
  try {
    // Platform-specific fields (RECORDING_OPTIONS.android/.ios — outputFormat,
    // audioEncoder, etc.) only get flattened onto the native options by
    // expo-audio's own prepareToRecordAsync wrapper (see its
    // ExpoAudio.ts/createRecordingOptions). That wrapper only runs when
    // options are passed here, not when they're only given to the
    // constructor — passing them again is required, or Android silently
    // falls back to its ancient AMR_NB/8kHz default regardless of the
    // sampleRate/bitRate requested above.
    await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
    recorder.record();
    activeRecorder = recorder;
  } catch (error) {
    // If preparation or starting the recording fails, release the native
    // recorder resource before rethrowing, to avoid leaking it.
    recorder.release();
    throw error;
  }
}

/** Stops the active capture and returns the local file path + duration. */
export async function stopCapture(): Promise<{ audioFilePath: string; durationSeconds: number }> {
  const recorder = activeRecorder;
  if (!recorder) {
    throw new Error("No recording in progress");
  }

  // Read status before stopping — stop() resets durationMillis to 0 once
  // the recorder becomes idle, so capturing it after would always report 0.
  const status = recorder.getStatus();
  await recorder.stop();
  const audioFilePath = recorder.uri;
  activeRecorder = null;

  if (!audioFilePath) {
    throw new Error("Recording finished without producing an audio file");
  }

  return { audioFilePath, durationSeconds: Math.round(status.durationMillis / 1000) };
}

/** Live status of the in-progress capture, for driving a timer/waveform. Null when nothing is recording. */
export function getCaptureStatus(): RecorderState | null {
  return activeRecorder ? activeRecorder.getStatus() : null;
}

/** Pauses the active capture in place — the recorder stays alive (unlike stopCapture), just not writing audio. */
export async function pauseCapture(): Promise<void> {
  if (!activeRecorder) {
    throw new Error("No recording in progress");
  }
  await activeRecorder.pause();
}

/** Resumes a capture previously paused with pauseCapture(). */
export async function resumeCapture(): Promise<void> {
  if (!activeRecorder) {
    throw new Error("No recording in progress");
  }
  await activeRecorder.record();
}

export type MeetingAudioPlayback = {
  isLoaded: boolean;
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  /** Set if the file failed to load (e.g. missing/corrupted on disk). */
  error: string | null;
  togglePlayback: () => void;
  /** fraction is 0-1, e.g. from a scrubber's tap position. */
  seekToFraction: (fraction: number) => void;
  /** Normalized 0-1 amplitude per bar, fixed-size, spanning the whole track. */
  waveformBars: number[];
  /** How many leading bars in `waveformBars` fall before the current position. */
  playedBarCount: number;
};

export const WAVEFORM_BAR_COUNT = 40;
const WAVEFORM_BASELINE = 0.08; // minimum bar height fraction — silence still reads as a bar, not a gap
// Tuned for typical conversational speech RMS (~0.02-0.15 on a normalized
// -1..1 scale, mic a foot or two away) reaching most of the visual range,
// rather than requiring near-shouting volume to register any movement.
const WAVEFORM_SENSITIVITY = 8;

/**
 * Deterministic, duration-seeded amplitude shape for platforms where real
 * playback sampling isn't available (`AudioPlayer.isAudioSamplingSupported`
 * is false). Smooth sine-based variation so it still reads as a plausible
 * waveform rather than random noise, keeping the visualizer looking
 * intentional everywhere even without real sample data.
 */
function createFallbackWaveform(durationSeconds: number): number[] {
  const seed = Math.max(1, Math.round(durationSeconds * 100));
  return Array.from({ length: WAVEFORM_BAR_COUNT }, (_, i) => {
    const a = Math.sin(i * 0.9 + seed * 0.013) * 0.5 + 0.5;
    const b = Math.sin(i * 0.35 + seed * 0.041) * 0.5 + 0.5;
    return WAVEFORM_BASELINE + (a * 0.6 + b * 0.4) * (1 - WAVEFORM_BASELINE);
  });
}

/**
 * `stopCapture()` persists whatever absolute `file://` URI expo-audio hands
 * back at record time — it embeds the app's current container UUID
 * (`.../Application/<uuid>/Documents/...`). That UUID is NOT stable: a
 * reinstall (a fresh TestFlight/App Store build, or `expo run` after a native
 * rebuild during development) gets a new container, and iOS carries Documents
 * content forward into it without updating any paths stored inside our own
 * database. The result is old recordings whose saved `audioFilePath` points
 * at a container that no longer exists, even though the same file is sitting
 * safely under the new one.
 *
 * Fix: never trust the container segment of a stored path. Re-anchor
 * everything from "Documents/" onward on the CURRENT document directory
 * (`Paths.document`, from expo-file-system) every time we go to load a file,
 * rather than only at the moment it was recorded. This makes old rows
 * self-healing with no DB migration needed.
 */
export function resolveAudioFileUri(storedUri: string): string {
  const marker = "/Documents/";
  const markerIndex = storedUri.indexOf(marker);
  if (markerIndex === -1) return storedUri;

  const relativePath = storedUri.slice(markerIndex + marker.length);
  const documentRoot = Paths.document.uri.replace(/\/+$/, "");
  return `${documentRoot}/${relativePath}`;
}

/** Deletes a recorded audio file from disk — used when discarding an in-progress recording. */
export function deleteAudioFile(uri: string): void {
  const file = new File(resolveAudioFileUri(uri));
  if (file.exists) {
    file.delete();
  }
}

/**
 * Loads and controls playback of a meeting's recorded audio for the meeting
 * detail screen. Unlike capture, playback SHOULD stop when the owning screen
 * unmounts, so this uses expo-audio's own hooks directly instead of the
 * module-level singleton pattern above — no lifecycle mismatch to work
 * around here.
 *
 * The waveform bars double as the seek bar's visual, and are built from the
 * actual audio content via `useAudioSampleListener` as it plays — each bar
 * fills in with a real amplitude reading the first time that part of the
 * track is played. Platforms without sampling support (see expo-audio's
 * `isAudioSamplingSupported`) get a deterministic stand-in shape instead, so
 * the visualizer never looks broken or empty.
 */
export function useMeetingAudioPlayback(uri: string | null): MeetingAudioPlayback {
  const resolvedUri = uri ? resolveAudioFileUri(uri) : null;
  const player = useAudioPlayer(resolvedUri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);

  const barsRef = useRef<number[]>(new Array(WAVEFORM_BAR_COUNT).fill(WAVEFORM_BASELINE));
  const [waveformBars, setWaveformBars] = useState<number[]>(() =>
    new Array(WAVEFORM_BAR_COUNT).fill(WAVEFORM_BASELINE),
  );
  const lastBarsFlushRef = useRef(0);
  const fallbackAppliedRef = useRef(false);

  // useAudioSampleListener's own effect only resubscribes when `player.id`
  // changes, so the listener closure below can go stale (frozen to whichever
  // render first mounted it, with duration/currentTime still 0). Mirroring
  // status into a ref keeps the callback reading live values regardless.
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useAudioSampleListener(player, (sample) => {
    const latest = statusRef.current;
    if (latest.duration <= 0) return;
    const frames = sample.channels[0]?.frames;
    if (!frames || frames.length === 0) return;

    const rms = Math.sqrt(frames.reduce((sum, value) => sum + value * value, 0) / frames.length);
    const barIndex = Math.min(
      WAVEFORM_BAR_COUNT - 1,
      Math.floor((latest.currentTime / latest.duration) * WAVEFORM_BAR_COUNT),
    );
    const normalized = WAVEFORM_BASELINE + Math.min(1, rms * WAVEFORM_SENSITIVITY) * (1 - WAVEFORM_BASELINE);
    barsRef.current[barIndex] = Math.max(barsRef.current[barIndex], normalized);

    const now = Date.now();
    if (now - lastBarsFlushRef.current > 80) {
      lastBarsFlushRef.current = now;
      setWaveformBars([...barsRef.current]);
    }
  });

  // Falls back to a stand-in shape once we know duration and real sampling
  // isn't supported on this platform — only ever applies once per player.
  useEffect(() => {
    if (fallbackAppliedRef.current || status.duration <= 0 || player.isAudioSamplingSupported) return;
    fallbackAppliedRef.current = true;
    const fallback = createFallbackWaveform(status.duration);
    barsRef.current = fallback;
    setWaveformBars(fallback);
  }, [player.isAudioSamplingSupported, status.duration]);

  // Stable identities (via statusRef instead of closing over `status`
  // directly) so callers that capture these once — e.g. a PanResponder built
  // with a lazy useState initializer, which only runs on mount — keep working
  // against live playback state instead of whatever `status` looked like at
  // the moment they were first captured.
  const togglePlayback = useCallback(() => {
    const latest = statusRef.current;
    if (latest.playing) {
      player.pause();
      return;
    }
    const isFinished = latest.duration > 0 && latest.currentTime >= latest.duration;
    if (isFinished) {
      player.seekTo(0);
    }
    player.play();
  }, [player]);

  const seekToFraction = useCallback(
    (fraction: number) => {
      const latest = statusRef.current;
      if (latest.duration > 0) {
        player.seekTo(fraction * latest.duration);
      }
    },
    [player],
  );

  const playedBarCount =
    status.duration > 0 ? Math.round((status.currentTime / status.duration) * WAVEFORM_BAR_COUNT) : 0;

  return {
    isLoaded: status.isLoaded,
    isPlaying: status.playing,
    positionSeconds: status.currentTime,
    durationSeconds: status.duration,
    error: status.error,
    togglePlayback,
    seekToFraction,
    waveformBars,
    playedBarCount,
  };
}
