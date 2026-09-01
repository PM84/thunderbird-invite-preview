# addons.thunderbird.net listing draft

## Summary

Shows unconfirmed email invitations in the calendar without blocking
availability. Respond using Thunderbird's native invitation controls.

## Description

Invite Preview detects iTIP invitations in newly received messages and can scan
existing incoming messages over a configurable period on request. It stages
them in a local preview calendar and chooses the response identity from the
preferred calendar's configured email, falling back to Thunderbird's default
calendar. Thunderbird renders pending invitations with reduced opacity and a
dotted outline. Accept, tentatively accept, or decline them using Thunderbird's
existing invitation view. Accepted events are then transferred to the selected
target calendar; declined events are not added there. Processing is local, with
no analytics, telemetry, advertising, or remote services operated by the
developer.

## Version 1.0.0 notes

- Supports inline and attached `METHOD:REQUEST` invitations and cancellations.
- Adds a user-triggered history scan with a configurable 60-day default.
- Selects the calendar by configured email and falls back to the default
  calendar; a user-selected override remains available.
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
- Includes German and English localization.

## Before submission

- Complete `docs/manual-test-plan.md` against the final Thunderbird 154 build.
- Use <https://github.com/PM84/thunderbird-invite-preview> as the public source
  and homepage URL.
- Use <https://github.com/PM84/thunderbird-invite-preview/issues> as the support
  URL and `PRIVACY.md` on the `main` branch as the privacy-policy URL.
- Capture screenshots in German and English without personal calendar data.
- Confirm the permanent UUID and developer display name.
- Upload `dist/invite-preview-1.0.0.xpi` and explain the narrowly scoped Experiment
  API in reviewer notes.
- Follow `docs/releasing.md` to enable automatic submissions for later versions.