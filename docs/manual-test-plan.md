# Thunderbird 154 manual test plan

Use a fresh Thunderbird profile with a mail identity and a writable calendar
configured for the same email address.

1. Install the unsigned XPI temporarily and confirm the full-access permission
   text is expected for an Experiment add-on.
2. Receive a valid `METHOD:REQUEST` invitation as inline `text/calendar`.
3. Confirm one event with the original UID appears in the local Invite Preview
    calendar.
4. Confirm the review window opens on the Invitations tab and plays the same
   sound configured for Thunderbird calendar reminders. Disable calendar alarm
   sounds and confirm a later new window opens silently.
5. Confirm the event has a dotted outline, reduced opacity, and does not mark the
   time as busy.
6. Open the invitation detail in the review window, accept it, and confirm one
   normal RSVP is sent, the event reaches the selected target calendar, and the
   source email is marked as read.
7. Stage multiple invitations, choose **Accept all invitations**, confirm the
    prompt, and verify each successful event and email while a simulated failed
    target write remains listed for retry.
8. Repeat with a CalDAV provider that has already inserted the invitation before
    the message scan. Confirm no local duplicate is created.
9. Open Thunderbird's Invitations view and accept another event.
10. Confirm Thunderbird handles one RSVP prompt/send, the event appears in the
    selected target calendar with its original `TRANSP` value, and the local
    preview is removed only after the target write succeeds.
11. Repeat with tentative acceptance. Then decline a separate invitation and
    confirm no event is added to the target calendar.
12. Repeat with an attached `.ics` file using `application/octet-stream`.
13. Deliver the same message twice and confirm only one event exists.
14. Deliver a higher `SEQUENCE` update and confirm the pending event changes.
15. Deliver a cancellation for a pending preview and confirm it is removed
    without opening the review window.
16. Deliver a cancellation for an accepted event. Confirm the review window
    opens on the Cancellations tab and the calendar event remains unchanged.
17. Remove the event from the cancellation detail and confirm the cancellation
    email is marked as read. Dismiss another cancellation and confirm its email
    read state is unchanged.
18. Open several accepted-event cancellations. Confirm list ordering, previous
    and next chevrons, individual removal, dismissal, and confirmed bulk removal.
19. Confirm a failed calendar deletion remains listed and can be retried.
20. Confirm an organizer mismatch or older `SEQUENCE` cannot remove an event.
21. Cancel one occurrence of a recurring event and confirm only that occurrence
    is removed after user confirmation.
22. Confirm junk messages, malformed ICS, files larger than 1 MiB, and invitations
    for an unrelated identity create no event.
23. Configure one target calendar with the invitation recipient's email and make
    a different calendar the default and fallback. Confirm the matching identity
    calendar is still selected for native RSVP handling.
24. Configure another writable calendar to inherit Thunderbird's default email.
    Confirm the explicitly assigned matching calendar still takes precedence,
    and that the inherited identity remains usable when no explicit assignment
    matches.
25. Remove the matching calendar email and confirm automatic selection uses the
    selected fallback, or the default calendar when no fallback is configured.
26. Put an already accepted event in a non-default calendar, then run the history
    scan. Confirm no preview with the same UID is created.
27. Set the history period to 60 days. Put read invitations inside and outside
    that range in an inbox and an archive, then run the history scan. Confirm
    only in-range messages are staged.
28. Confirm the history scan ignores sent, draft, junk, template, outbox, and
    trash folders.
29. Disable automatic scanning, receive an invite, and use the popup's mailbox
    scan action. Confirm the configured history scan still runs explicitly.
30. Confirm the popup contains exactly the two counters, mailbox scan, preview
    cleanup, review-window, and settings actions.
31. Remove all pending previews from the popup and confirm accepted events remain.
32. Restart Thunderbird and confirm pending and cancellation counts still work.
33. Move an invitation email, restart Thunderbird, accept it in the review
    window, and confirm the moved message is found by Message-ID and marked read.
34. Make the selected target temporarily unwritable, accept a preview, and
    confirm the accepted local copy remains. Restore write access and trigger
    reconciliation; confirm the transfer completes without a second RSVP.

Record the exact Thunderbird build ID and operating system in the release issue.