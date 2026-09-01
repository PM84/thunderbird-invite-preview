import ICAL from "../../vendor/ical.js";

export const MAX_ICAL_BYTES = 1024 * 1024;
const MAX_EVENTS_PER_CALENDAR = 50;
const SUPPORTED_METHODS = new Set(["REQUEST", "CANCEL"]);

export async function createCalendarCandidate(icalText) {
  assertCalendarSize(icalText);

  let calendar;
  try {
    calendar = new ICAL.Component(ICAL.parse(icalText));
  } catch (error) {
    throw new Error("Invalid iCalendar data", { cause: error });
  }

  if (calendar.name !== "vcalendar") {
    throw new Error("Expected a VCALENDAR component");
  }

  const components = calendar.getAllSubcomponents("vevent");
  if (components.length === 0) {
    throw new Error("The iCalendar data does not contain a VEVENT");
  }
  if (components.length > MAX_EVENTS_PER_CALENDAR) {
    throw new Error("The iCalendar data contains too many events");
  }

  const eventUids = new Set();
  for (const component of components) {
    const uid = stringValue(component.getFirstPropertyValue("uid"));
    if (!uid) {
      throw new Error("Every VEVENT must have a UID");
    }
    eventUids.add(uid);
  }

  const method = stringValue(calendar.getFirstPropertyValue("method")).toUpperCase();
  if (SUPPORTED_METHODS.has(method) && eventUids.size !== 1) {
    throw new Error(`METHOD:${method} must contain a single event UID`);
  }

  const primary =
    components.find(component => !component.hasProperty("recurrence-id")) ?? components[0];
  const hasOrganizer = primary.hasProperty("organizer");
  const attendeeCount = primary.getAllProperties("attendee").length;

  return {
    type: "calendar",
    icalText,
    actionable:
      method === "CANCEL" ||
      (method === "REQUEST" && hasOrganizer && attendeeCount > 0),
    fingerprint: await createFingerprint(method, components),
  };
}

function assertCalendarSize(icalText) {
  if (typeof icalText !== "string" || icalText.trim() === "") {
    throw new Error("iCalendar data must be a non-empty string");
  }

  if (new TextEncoder().encode(icalText).byteLength > MAX_ICAL_BYTES) {
    throw new Error("The iCalendar data exceeds the size limit");
  }
}

async function createFingerprint(method, components) {
  const revisions = components
    .map(component =>
      [
        stringValue(component.getFirstPropertyValue("uid")),
        stringValue(component.getFirstPropertyValue("recurrence-id")),
        stringValue(component.getFirstPropertyValue("sequence")) || "0",
        stringValue(component.getFirstPropertyValue("dtstamp")),
      ]
    )
    .sort((first, second) =>
      JSON.stringify(first).localeCompare(JSON.stringify(second))
    );

  const input = new TextEncoder().encode(
    JSON.stringify([method || "NONE", revisions])
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function stringValue(value) {
  return value == null ? "" : String(value);
}