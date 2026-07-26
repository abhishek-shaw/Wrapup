import { create } from "zustand";

export type RecordingPhase = "idle" | "recording" | "processing";

type RecordingState = {
  recordingState: RecordingPhase;
  activeMeetingId: string | null;
  activeMeetingTitle: string | null;
  /** epoch ms — lets any screen compute elapsed time without polling the native module. */
  recordingStartedAt: number | null;
  /** Sub-state of "recording" — the mic is paused but the session (and its meeting row) is still live. */
  isPaused: boolean;
  beginRecording: (params: { meetingId: string; title: string }) => void;
  pause: () => void;
  resume: () => void;
  markProcessing: () => void;
  finish: () => void;
};

export const useRecordingStore = create<RecordingState>((set) => ({
  recordingState: "idle",
  activeMeetingId: null,
  activeMeetingTitle: null,
  recordingStartedAt: null,
  isPaused: false,

  beginRecording: ({ meetingId, title }) =>
    set({
      recordingState: "recording",
      activeMeetingId: meetingId,
      activeMeetingTitle: title,
      recordingStartedAt: Date.now(),
      isPaused: false,
    }),

  pause: () => set({ isPaused: true }),
  resume: () => set({ isPaused: false }),

  markProcessing: () => set({ recordingState: "processing", isPaused: false }),

  finish: () =>
    set({
      recordingState: "idle",
      activeMeetingId: null,
      activeMeetingTitle: null,
      recordingStartedAt: null,
      isPaused: false,
    }),
}));
