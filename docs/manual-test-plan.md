# Thunderbird 154 manual test plan

Use a fresh Thunderbird profile with a mail identity and a writable calendar
configured for the same email address.

1. Install the unsigned XPI temporarily and confirm the full-access permission
   text is expected for an Experiment add-on.
2. Receive a valid `METHOD:REQUEST` invitation as inline `text/calendar`.
3. Confirm one event with the original UID appears in the local Invite Preview
    calendar.
4. Confirm the event has a dotted outline, reduced opacity, and does not mark the
   time as busy.
5. Repeat with a CalDAV provider that has already inserted the invitation before
    the message scan. Confirm no local duplicate is created.
6. Open Thunderbird's Invitations view and accept the event.
7. Confirm Thunderbird handles one RSVP prompt/send, the event appears in the
    selected target calendar with its original `TRANSP` value, and the local
    preview is removed only after the target write succeeds.
8. Repeat with tentative acceptance. Then decline a separate invitation and
    confirm no event is added to the target calendar.
9. Repeat with an attached `.ics` file using `application/octet-stream`.
10. Deliver the same message twice and confirm only one event exists.
11. Deliver a higher `SEQUENCE` update and confirm the pending event changes.
12. Deliver a cancellation for a pending preview and confirm it is removed
    without opening the review window.
13. Deliver a cancellation for an accepted event. Confirm the review window
    opens on its list page and the calendar event remains unchanged.
14. Open several accepted-event cancellations. Confirm list ordering, previous
    and next chevrons, individual removal, dismissal, and confirmed bulk removal.
15. Confirm a failed calendar deletion remains listed and can be retried.
16. Confirm an organizer mismatch or older `SEQUENCE` cannot remove an event.
17. Cancel one occurrence of a recurring event and confirm only that occurrence
    is removed after user confirmation.
18. Confirm junk messages, malformed ICS, files larger than 1 MiB, and invitations
    for an unrelated identity create no event.
19. Configure one target calendar with the invitation recipient's email and make
    a different calendar the default and fallback. Confirm the matching identity
    calendar is still selected for native RSVP handling.
20. Configure another writable calendar to inherit Thunderbird's default email.
    Confirm the explicitly assigned matching calendar still takes precedence,
    and that the inherited identity remains usable when no explicit assignment
    matches.
21. Remove the matching calendar email and confirm automatic selection uses the
    selected fallback, or the default calendar when no fallback is configured.
22. Put an already accepted event in a non-default calendar, then run the history
    scan. Confirm no preview with the same UID is created.
23. Set the history period to 60 days. Put read invitations inside and outside
    that range in an inbox and an archive, then run the history scan. Confirm
    only in-range messages are staged.
24. Confirm the history scan ignores sent, draft, junk, template, outbox, and
    trash folders.
25. Disable automatic scanning, receive an invite, and use the popup to scan the
    displayed message manually.
26. Run the history scan while automatic scanning is disabled and confirm it
    still runs on explicit request.
27. Remove all pending previews from the popup and confirm accepted events remain.
28. Restart Thunderbird and confirm pending and cancellation counts still work.
29. Make the selected target temporarily unwritable, accept a preview, and
    confirm the accepted local copy remains. Restore write access and trigger
    reconciliation; confirm the transfer completes without a second RSVP.

Record the exact Thunderbird build ID and operating system in the release issue.