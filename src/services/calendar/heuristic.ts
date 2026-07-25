import type { CalendarEventInfo } from "./index";

/**
 * Heuristic-only signal for whether a calendar event looks like a meeting
 * worth recording. This never fully decides on its own — per AGENTS.md,
 * detection is "heuristic + user-confirmed": the user tapping an event to
 * record it is the actual confirmation, this just drives which events get
 * the "looks like a meeting" styling and record prompt in the UI.
 */

const PERSONAL_EVENT_KEYWORDS = [
  "birthday",
  "anniversary",
  "holiday",
  "vacation",
  "pto",
  "out of office",
  "ooo",
  "lunch",
  "gym",
  "dentist",
  "doctor",
  "commute",
  "focus time",
  "personal",
];

const CONFERENCE_LINK_KEYWORDS = ["zoom.us", "meet.google.com", "teams.microsoft.com", "webex.com"];

export function isLikelyMeeting(event: CalendarEventInfo): boolean {
  if (event.allDay) return false;

  const haystack = `${event.title} ${event.location ?? ""} ${event.notes ?? ""}`.toLowerCase();
  if (PERSONAL_EVENT_KEYWORDS.some((keyword) => haystack.includes(keyword))) return false;
  if (CONFERENCE_LINK_KEYWORDS.some((keyword) => haystack.includes(keyword))) return true;

  return (event.attendeeCount ?? 0) >= 2;
}
