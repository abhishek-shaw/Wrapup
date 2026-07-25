/**
 * expo-calendar wrapper — the only place in the app that talks to
 * `expo-calendar` directly. See AGENTS.md: native module boundaries get a
 * typed wrapper in services/, not ad hoc calls from screens.
 *
 * Read-only: this app only ever reads the device calendar to show meetings
 * and offer to record them. It never creates, edits, or deletes events.
 */
import * as Calendar from "expo-calendar";

export type CalendarEventInfo = {
  id: string;
  title: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  allDay: boolean;
  location: string | null;
  notes: string | null;
  /** Null when attendees couldn't be resolved for this event/platform. */
  attendeeCount: number | null;
};

export async function getCalendarPermissionStatus(): Promise<boolean> {
  const { granted } = await Calendar.getCalendarPermissions();
  return granted;
}

export async function requestCalendarPermission(): Promise<boolean> {
  const { granted } = await Calendar.requestCalendarPermissions();
  return granted;
}

/** All events on the device's local calendar day, across every calendar. */
export async function getEventsForToday(): Promise<CalendarEventInfo[]> {
  const granted = await getCalendarPermissionStatus();
  if (!granted) return [];

  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const events = await Calendar.listEvents(
    calendars.map((calendar) => calendar.id),
    startOfDay,
    endOfDay,
  );

  return Promise.all(
    events.map(async (event) => {
      const attendees = await event.getAttendees().catch(() => null);
      return {
        id: event.id,
        title: event.title,
        startDate: new Date(event.startDate).toISOString(),
        endDate: new Date(event.endDate).toISOString(),
        allDay: event.allDay,
        location: event.location,
        notes: event.notes,
        attendeeCount: attendees ? attendees.length : null,
      };
    }),
  );
}
