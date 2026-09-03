# Invite Preview for Thunderbird

[![CI](https://github.com/PM84/thunderbird-invite-preview/actions/workflows/ci.yml/badge.svg)](https://github.com/PM84/thunderbird-invite-preview/actions/workflows/ci.yml)

Invite Preview shows actionable iTIP invitations in Thunderbird's calendar
before the user responds. Pending invitations remain transparent and do not
block availability. A shared review window lists pending invitations and
cancellations; Thunderbird's native invitation controls remain available.

## Features

- Detects inline and attached `VEVENT` invitations using `METHOD:REQUEST`.
- Applies `METHOD:CANCEL` messages to pending previews created by the add-on.
- Opens a shared invitation review window for new actionable mail and plays the
	configured Thunderbird calendar reminder sound.
- Lists pending invitations and accepted-event cancellations on separate tabs.
	Invitations can be accepted individually or in a confirmed batch with normal
	iTIP replies. Cancellations can be dismissed, removed individually, or removed
	in a confirmed batch; real calendar events are never removed automatically.
- Marks the corresponding email as read after an invitation is accepted or a
	cancelled event is removed from its calendar.
- Scans new non-junk mail automatically.
- Scans existing incoming mail on demand over a configurable period of 1 to
	3650 days, with a default of 60 days.
- Selects a writable target calendar by its resolved email identity. Explicit
	calendar assignments take precedence over inherited Thunderbird identities.
	If no calendar identity matches, it uses the selected fallback and then
	Thunderbird's default calendar.
- Checks every real calendar and its local cache for an existing UID before
	creating a preview, including during history scans.
- Restores pending previews after Thunderbird restarts.
- Transfers accepted and tentatively accepted events to the selected target
	calendar, and retries failed transfers without sending another RSVP.
- Removes declined previews without creating target-calendar events.

Regular ICS exports without invitation semantics and free-text date extraction
are outside the supported scope.

## Compatibility

Version `1.2.0` supports Thunderbird `154.*`. The add-on uses a narrowly scoped
Experiment API because Thunderbird does not provide a stable MailExtension
calendar API. Each new Thunderbird major version requires the manual test plan
before the manifest compatibility range is expanded.

## Development

Requirements:

- Node.js 22.13 or newer
- npm 10

```bash
npm ci
npm run check
npm audit
```

`npm run check` runs ESLint, all unit tests, release-structure validation, and
creates `dist/invite-preview-1.2.0.xpi`. The build copies the pinned `ical.js`
release byte-for-byte and packages readable source without bundling,
transpilation, or minification.

For a temporary installation, run `npm run vendor`, open **Add-ons and Themes >
Debug Add-ons > Load Temporary Add-on** in Thunderbird, and select
`manifest.json`.

## Permissions

- `messagesRead`: reads calendar MIME parts and ICS attachments from eligible
	messages.
- `messagesUpdate`: marks the source invitation or cancellation email as read
  after the user successfully accepts the corresponding review action.
- `accountsRead`: receives new-mail events and resolves invited identities.
- `storage`: stores settings, deduplication fingerprints, and pending preview
	recovery data locally.

Thunderbird displays a full-access warning for all Experiment add-ons. The
privileged surface and security boundaries are documented in
[docs/architecture.md](docs/architecture.md). Data handling is documented in
[PRIVACY.md](PRIVACY.md).

## Release

The permanent add-on ID is `{81eecdaa-2f2e-4977-873f-d5d0beb47fdd}`. Complete
[docs/manual-test-plan.md](docs/manual-test-plan.md) against the target
Thunderbird build before publishing. Listing copy and submission checks are in
[docs/atn-listing.md](docs/atn-listing.md). The GitHub and automated ATN release
process is documented in [docs/releasing.md](docs/releasing.md).

## License

Copyright 2026 Dr. Peter Mayer. Licensed under the Mozilla Public License 2.0.
See [LICENSE](LICENSE).