# Changelog

## 1.0.1 - 2026-09-01

- Match invitations to the email identity configured on each calendar before
  using a selected fallback or Thunderbird's default calendar. Explicit
  calendar identities take precedence over inherited default identities.
- Detect existing event UIDs across every real calendar and its local cache so
  history scans do not recreate already accepted events as previews.
- Enforce synthetic test fixtures using reserved `example.test` identities and
  reject real email domains, web hosts, and local profile paths during tests.

## 1.0.0 - 2026-09-01

- Detect inline and attached iTIP requests and cancellations in incoming mail.
- Scan existing incoming messages over a configurable 60-day default period.
- Select the target calendar by configured email identity, explicit preference,
  or Thunderbird's default calendar.
- Show pending invitations as transparent, non-blocking events in a dedicated
  local preview calendar.
- Preserve Thunderbird's native invitation response flow.
- Transfer accepted and tentatively accepted events to the selected target
  calendar and retry failed transfers without another RSVP.
- Remove declined or cancelled previews without creating target events.
- Restore pending previews after Thunderbird restarts.
- Provide English and German user interfaces with local-only data processing.