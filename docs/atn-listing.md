# addons.thunderbird.net listing draft

## Summary

Shows unconfirmed email invitations in the calendar without blocking
availability. Review invitations and cancellations in one focused window.

## Description

Invite Preview detects iTIP invitations in newly received messages and can scan
existing incoming messages over a configurable period on request. It stages
them in a local preview calendar and selects a calendar whose email identity
matches the invited identity. Explicit calendar assignments take precedence
over inherited identities. A selected fallback or Thunderbird's default is
used only when no calendar email matches. Thunderbird renders pending invitations with reduced opacity and a
dotted outline. A shared review window opens for new actionable invitations or
cancellations and uses the configured calendar reminder sound. Pending
invitations can be accepted, tentatively accepted, or declined there, or handled
in Thunderbird's existing invitation view. Accepted and tentative events are
transferred to the selected target calendar; declined invitations are removed
without creating an event. Cancellations for accepted events never remove calendar data without
explicit user confirmation. A successful review action marks its source email
as read. Processing is local, with
no analytics, telemetry, advertising, or remote services operated by the
developer.

## Version 1.3.0 notes

- Supports inline and attached `METHOD:REQUEST` invitations and cancellations.
- Adds a user-triggered history scan with a configurable 60-day default.
- Selects the calendar by its configured email before using a selected fallback
  or Thunderbird's default calendar.
- Checks all real calendar caches for an existing UID before staging a preview.
- Prevents unreadable messages or unavailable calendar providers from blocking
  an entire history scan.
- Stages previews in a dedicated local memory calendar without modifying
  Thunderbird prototypes or calendar databases.
- Restores pending previews from local extension storage after a restart.
- Uses direct UID-aware operations in the isolated memory calendar while
  preserving Thunderbird's native invitation response handling.
- Keeps newly staged attendees in `NEEDS-ACTION` until the user responds.
- Transfers accepted and tentatively accepted events to the selected calendar,
  retaining the local copy for retry until the target write succeeds.
- Removes declined previews without adding an event to the target calendar.
- Adds a shared review window with invitation and cancellation tabs, list and
  detail views, Accept/Tentative/Decline invitation responses, confirmed bulk
  acceptance, individual cancellation dismissal or removal, and confirmed bulk
  removal.
- Opens the review window for new actionable email and plays Thunderbird's
  configured calendar reminder sound.
- Marks the associated email as read after a successful invitation acceptance
  or confirmed cancellation removal.
- Automatically removes only pending local previews; accepted events require an
  explicit user action and are revalidated immediately before deletion.
- Includes German and English localization.
- Fixes review-window acceptance against Thunderbird's strict memory-calendar
  item identity and preserves pending RSVP state during transfer retries.

## Before submission

- Complete `docs/manual-test-plan.md` against the final Thunderbird 154 build.
- Use <https://github.com/PM84/thunderbird-invite-preview> as the public source
  and homepage URL.
- Use <https://github.com/PM84/thunderbird-invite-preview/issues> as the support
  URL and `PRIVACY.md` on the `main` branch as the privacy-policy URL.
- Capture screenshots in German and English without personal calendar data.
- Confirm the permanent UUID and developer display name.
- Upload `dist/invite-preview-1.3.0.xpi` and explain the narrowly scoped Experiment
  API in reviewer notes.
- Follow `docs/releasing.md` to enable automatic submissions for later versions.