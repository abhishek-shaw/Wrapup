import { create } from "zustand";

export type RecordingPhase = "idle" | "recording" | "processing";

type RecordingState = {
  recordingState: RecordingPhase;
  activeMeetingId: string | null;
  activeMeetingTitle: string | null;
  /** epoch ms — lets any screen compute elapsed time without polling the native module. */
  recordingStartedAt: number | null;
  beginRecording: (params: { meetingId: string; title: string }) => void;
  markProcessing: () => void;
  finish: () => void;
};

export const useRecordingStore = create<RecordingState>((set) => ({
  recordingState: "idle",
  activeMeetingId: null,
  activeMeetingTitle: null,
  recordingStartedAt: null,

  beginRecording: ({ meetingId, title }) =>
    set({
      recordingState: "recording",
      activeMeetingId: meetingId,
      activeMeetingTitle: title,
      recordingStartedAt: Date.now(),
    }),

  markProcessing: () => set({ recordingState: "processing" }),

  finish: () =>
    set({
      recordingState: "idle",
      activeMeetingId: null,
      activeMeetingTitle: null,
      recordingStartedAt: null,
    }),
}));
