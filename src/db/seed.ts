/**
 * Dev-only starter content so the app isn't empty while the recording/ASR/LLM
 * pipeline (which is what would normally populate these tables) doesn't exist
 * yet. Never runs in production builds — real users start with zero meetings.
 */
import { getDb } from "./client";
import { createChatMessage } from "./queries/chat";
import { createMeeting } from "./queries/meetings";
import { indexMeeting } from "./queries/search";
import { upsertSummary } from "./queries/summaries";
import { createTodo } from "./queries/todos";
import { upsertTranscript } from "./queries/transcripts";
import { generateId } from "@/lib/id";

function daysAgoAt(days: number, hours: number, minutes: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export async function seedDevData(): Promise<void> {
  if (!__DEV__) return;

  const db = await getDb();
  const existing = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM meetings;");

  // Backfill transcripts for existing seeded meetings that don't have them yet
  if (existing && existing.count > 0) {
    const meetingsWithoutTranscripts = await db.getAllAsync<{ id: string; summary: string }>(
      `SELECT m.id, s.summary_text as summary
       FROM meetings m
       LEFT JOIN summaries s ON m.id = s.meeting_id
       LEFT JOIN transcripts t ON m.id = t.meeting_id
       WHERE t.meeting_id IS NULL AND s.summary_text IS NOT NULL;`
    );

    for (const meeting of meetingsWithoutTranscripts) {
      await upsertTranscript({
        meetingId: meeting.id,
        text: meeting.summary,
        segments: [{ speakerLabel: null, startSeconds: 0, endSeconds: 0, text: meeting.summary }],
        language: "en",
      });
    }

    return;
  }

  const meetings = [
    {
      id: generateId(),
      title: "Product sync",
      source: "calendar_meeting" as const,
      startedAt: daysAgoAt(0, 9, 0),
      attendeeCount: 4,
      summary:
        "The team agreed to delay the export feature by one sprint to prioritize the onboarding redesign. Priya will share updated mockups by Wednesday, and the team will revisit the timeline in next week's sync.",
      transcriptPreview: "Delay export, prioritize onboarding...",
      actionItems: [
        { text: "Share updated onboarding mockups — Priya, by Wed", dueDate: daysFromNow(1), completed: false },
        { text: "Push export feature to next sprint in roadmap", dueDate: null, completed: false },
        { text: "Add timeline recap to next week's sync agenda", dueDate: daysFromNow(4), completed: false },
      ],
      chatSeed: [
        { role: "user" as const, text: "What did we decide about the export feature?" },
        {
          role: "assistant" as const,
          text: "You agreed to push it to next sprint so the team could prioritize the onboarding redesign. It'll be revisited in next week's sync.",
        },
        { role: "user" as const, text: "Who's owning the mockups?" },
        { role: "assistant" as const, text: "Priya. She's sharing updated onboarding mockups by Wednesday." },
      ],
    },
    {
      id: generateId(),
      title: "Personal dictation",
      source: "manual_dictation" as const,
      startedAt: daysAgoAt(1, 16, 12),
      attendeeCount: null,
      summary:
        "Quick notes on offsite ideas: a team-building afternoon, a budget cap of $150 per person, and a survey before finalizing the venue.",
      transcriptPreview: "Ideas for the offsite agenda...",
      actionItems: [{ text: "Send offsite ideas survey to the team", dueDate: null, completed: false }],
      chatSeed: [],
    },
    {
      id: generateId(),
      title: "Design review with Priya",
      source: "calendar_meeting" as const,
      startedAt: daysAgoAt(4, 14, 0),
      attendeeCount: 2,
      summary:
        "Walked through onboarding flow v2. The group liked the simplified permissions step and asked for one more pass on empty states before handoff.",
      transcriptPreview: "Reviewed onboarding flow v2...",
      actionItems: [{ text: "Polish empty states for onboarding flow v2", dueDate: null, completed: true }],
      chatSeed: [],
    },
    {
      id: generateId(),
      title: "Quarterly planning",
      source: "calendar_meeting" as const,
      startedAt: daysAgoAt(25, 10, 0),
      attendeeCount: 6,
      summary:
        "The team set three Q3 goals: ship the onboarding redesign, reduce churn by 10%, and hire two engineers.",
      transcriptPreview: "Set Q3 goals for the team...",
      actionItems: [
        { text: "Draft Q3 OKR doc", dueDate: null, completed: true },
        { text: "Post two engineering roles", dueDate: null, completed: false },
      ],
      chatSeed: [],
    },
  ];

  for (const meeting of meetings) {
    await createMeeting({
      id: meeting.id,
      title: meeting.title,
      source: meeting.source,
      startedAt: meeting.startedAt.toISOString(),
      status: "ready",
    });

    await upsertSummary({ meetingId: meeting.id, summaryText: meeting.summary, modelTier: "balanced" });

    // Seed meetings skip the real ASR pipeline, so there's no natural
    // transcript — reuse the summary as a stand-in. Without a transcripts
    // row, meeting chat silently has nothing to generate a reply from (see
    // the `!transcript?.text` guard in app/meeting/[id]/chat/index.tsx).
    // A single segment (rather than none) is required too — TranscriptView
    // reads an empty segments array as "no speech detected", regardless of
    // `text`.
    await upsertTranscript({
      meetingId: meeting.id,
      text: meeting.summary,
      segments: [{ speakerLabel: null, startSeconds: 0, endSeconds: 0, text: meeting.summary }],
      language: "en",
    });

    for (const item of meeting.actionItems) {
      await createTodo({
        id: generateId(),
        meetingId: meeting.id,
        text: item.text,
        dueDate: item.dueDate ? item.dueDate.toISOString() : null,
        completed: item.completed,
      });
    }

    for (const message of meeting.chatSeed) {
      await createChatMessage({ id: generateId(), meetingId: meeting.id, role: message.role, text: message.text });
    }

    await indexMeeting({
      meetingId: meeting.id,
      title: meeting.title,
      summaryText: meeting.summary,
      transcriptText: meeting.transcriptPreview,
    });
  }
}
