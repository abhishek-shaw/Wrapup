/**
 * Wrapup core data types.
 *
 * These map directly to the SQLite schema in db/schema.ts. Keep them in
 * sync — a field added here without a matching column (or vice versa)
 * is the most common source of silent bugs in this app.
 */

export type RecordingSource = "calendar_meeting" | "manual_dictation";

export type RecordingStatus =
  | "recording" // actively capturing audio
  | "processing" // transcribing / summarizing on-device
  | "ready" // transcript + summary available
  | "failed"; // processing failed, can be retried

export interface Meeting {
  id: string; // uuid
  title: string;
  /** Null for manual dictations with no linked calendar event */
  calendarEventId: string | null;
  source: RecordingSource;
  startedAt: string; // ISO 8601
  endedAt: string | null; // ISO 8601, null while still recording
  durationSeconds: number | null;
  attendeeCount: number | null;
  status: RecordingStatus;
  /** Local file path to the raw audio, e.g. in app document directory */
  audioFilePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Transcript {
  meetingId: string; // foreign key -> Meeting.id, one-to-one
  text: string; // full transcript text
  /** Optional speaker-labeled segments, if diarization is added later */
  segments: TranscriptSegment[] | null;
  language: string | null; // detected language code, e.g. "en"
  generatedAt: string;
}

export interface TranscriptSegment {
  speakerLabel: string | null; // e.g. "Speaker 1", null if unknown
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface Summary {
  meetingId: string; // foreign key -> Meeting.id, one-to-one
  summaryText: string;
  generatedAt: string;
  /** Which model tier produced this, for debugging/quality tracking */
  modelTier: "fast" | "balanced" | "best_quality" | null;
}

export type TodoSourceType = "meeting" | "manual";

export interface Todo {
  id: string; // uuid
  meetingId: string | null; // foreign key -> Meeting.id, null if manual
  text: string;
  ownerHint: string | null; // e.g. "Priya", extracted from summary, freeform
  dueDate: string | null; // ISO 8601 date, null if no due date
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string; // uuid
  meetingId: string; // foreign key -> Meeting.id — chat is scoped per meeting, no cross-meeting chat (see AGENTS.md)
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export type ModelTier = "fast" | "balanced" | "best_quality";

export interface ModelDownloadState {
  tier: ModelTier;
  status: "not_downloaded" | "downloading" | "paused" | "ready" | "failed";
  bytesDownloaded: number;
  bytesTotal: number;
  localFilePath: string | null;
}

export interface AppSettings {
  userName: string | null;
  calendarConnected: boolean;
  autoRecordDetectedMeetings: boolean;
  remindAboutOpenTodos: boolean;
  requireFaceIdToOpen: boolean;
  downloadOverWifiOnly: boolean;
  activeModelTier: ModelTier | null;
}
