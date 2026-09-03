# Changelog

## 1.2.0 - 2026-09-03

- Combine pending invitations and accepted-event cancellations in one review
  window with separate tabs, shared detail navigation, and confirmed bulk
  invitation acceptance.
- Open the review window for newly received actionable invitations and
  cancellations, using Thunderbird's configured calendar reminder sound.
- Accept pending invitations from the review window through Thunderbird's iTIP
  reply transport and transfer them to the selected target calendar.
- Mark the corresponding invitation or cancellation email as read after a
  successful review action, including stable lookup after restarts or moves.
- Reduce the toolbar popup to mailbox scan, preview cleanup, and review-window
  actions while retaining invitation and cancellation counts and settings.

## 1.1.0 - 2026-09-02

- Remove cancelled pending previews automatically after organizer and revision
  validation.
- Queue cancellations for events in real calendars without deleting them.
- Open a focused cancellation review window with a complete list, detail
  navigation, individual removal, dismissal, and user-confirmed bulk removal.
- Revalidate the cancellation against the live calendar item before every
  deletion and retain failed operations for retry.
- Apply occurrence cancellations to only the specified recurring instance.
- Prevent older invitations discovered by history scans from reappearing after
  a newer cancellation by storing bounded pseudonymous revision markers.

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