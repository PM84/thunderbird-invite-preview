export function invitation(overrides = {}) {
  const values = {
    method: "REQUEST",
    uid: "meeting@example.test",
    sequence: "0",
    ...overrides,
  };

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Invite Preview Test//EN",
    `METHOD:${values.method}`,
    "BEGIN:VEVENT",
    `UID:${values.uid}`,
    `SEQUENCE:${values.sequence}`,
    "DTSTAMP:20260901T080000Z",
    "DTSTART:20260902T090000Z",
    "DTEND:20260902T100000Z",
    "SUMMARY:Planning",
    "ORGANIZER:mailto:organizer@example.test",
    "ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:user@example.test",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}