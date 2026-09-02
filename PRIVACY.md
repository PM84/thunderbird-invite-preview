# Privacy Policy

Effective date: 2026-09-01

Invite Preview processes data locally inside Thunderbird. It does not operate a
server, perform analytics, display advertising, or send message content to the
developer or any third party. The manifest therefore declares the built-in
`none` data-collection permission.

## Data accessed

The add-on reacts to newly received non-junk messages. At the user's request,
it can also query existing incoming messages within the configured lookback
period, including read messages. Sent, draft, junk, template, outbox, and trash
folders are excluded. For eligible messages it reads inline `text/calendar`
parts and calendar attachments, including files ending in `.ics`. Calendar
payloads larger than 1 MiB and calendars containing more than 50 events are
ignored.

## Data stored

The add-on stores these values in Thunderbird's local extension storage:

- whether automatic scanning is enabled;
- the configured history lookback period in days;
- the selected target calendar identifier;
- SHA-256 revision fingerprints used to avoid processing the same invitation
	twice;
- calendar and event identifiers for pending previews;
- the selected target and response status while a failed transfer is pending;
- complete ICS payloads only for pending previews, so the local memory calendar
	can be restored after Thunderbird restarts.
- complete cancellation ICS payloads while an accepted-event cancellation is
  awaiting review, so it can be revalidated before a user-requested deletion.
- bounded SHA-256 cancellation markers with sequence numbers, so an older
	invitation found later cannot recreate a cancelled preview.

The add-on does not store message bodies. Stored ICS payloads are removed after
the invitation or cancellation review is resolved, dismissed, or cleared.

## Calendar synchronization and replies

A pending invitation is written to a dedicated local calendar created by the
add-on. A target calendar whose configured email matches the invited identity
is selected first. If none matches, the configured fallback or Thunderbird's
default calendar is used. The pending preview is not uploaded to that target.
After the user accepts or tentatively accepts, Invite
Preview adds the event to that exact calendar through Thunderbird. A remote
calendar provider may then synchronize it normally. The local preview is
removed only after the target accepts the event. A failed transfer is retained
and retried without sending another RSVP. Declining removes the local preview
without adding an event to the target calendar.

A cancellation for a pending local preview removes that preview automatically
after the organizer and revision match. A cancellation for an event in a real
calendar is placed in a local review queue and opens a review window. The event
remains unchanged until the user explicitly removes it individually or confirms
bulk removal. The cancellation is checked against the current calendar item
again immediately before deletion. Failed or mismatched operations remain in
the review queue until retried or dismissed.

Staging an invitation does not send an RSVP. Thunderbird may send an RSVP only
after the user explicitly accepts, tentatively accepts, or declines through
Thunderbird's invitation controls and according to Thunderbird's own response
settings.

Removing pending previews deletes those events from the local preview calendar.

## Permissions

The add-on requests `messagesRead`, `accountsRead`, and `storage`. It also uses a
bundled Thunderbird Experiment because no stable MailExtension calendar API is
available. Thunderbird therefore displays its full, unrestricted access warning
during installation even though the Experiment only exposes the calendar
operations documented in this project's source code.

## Contact

Use the support or security contact published with Invite Preview on
addons.thunderbird.net. Support requests can also be submitted through the
[public issue tracker](https://github.com/PM84/thunderbird-invite-preview/issues),
and vulnerabilities through
[GitHub Security Advisories](https://github.com/PM84/thunderbird-invite-preview/security/advisories/new).
Do not include message content, calendar data, account identifiers, or other
personal data in a public report.