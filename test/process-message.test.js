import assert from "node:assert/strict";

import { processMessage } from "../src/application/process-message.js";
import { createCalendarCandidate } from "../src/core/calendar-candidate.js";
import { invitation } from "./fixtures.js";

const candidate = await createCalendarCandidate(invitation());
const calls = [];
const tracked = [];
const trackedCancellations = [];
const cancellationMarkers = [];
const dependencies = {
  extractors: [{ async extract() { return [candidate]; } }],
  calendarGateway: {
    async stage(receivedCandidate, details) {
      calls.push({ receivedCandidate, details });
      return {
        status: "staged",
        pending: true,
        calendarId: "calendar-1",
        itemId: "meeting@example.test",
      };
    },
  },
  processedStore: {
    async has() { return false; },
    async mark() {},
    async trackPreview(preview) { tracked.push(preview); },
    async trackCancellation(cancellation) {
      trackedCancellations.push(cancellation);
    },
    async isCancelled() { return false; },
    async recordCancellation(eventScopes, recordedAt) {
      cancellationMarkers.push({ eventScopes, recordedAt });
    },
  },
  settings: {
    enabled: true,
    preferredCalendarId: "calendar-1",
  },
};

const outcomes = await processMessage({ id: 42, junk: false }, dependencies);

assert.equal(outcomes[0].status, "staged");
assert.equal(calls.length, 1);
assert.equal(calls[0].details.preferredCalendarId, "calendar-1");
assert.equal(tracked[0].itemId, "meeting@example.test");
assert.equal(tracked[0].icalText, candidate.icalText);
assert.equal(tracked[0].preferredCalendarId, "calendar-1");

const unsupportedCalendarExtractor = {
  async extract() {
    return [
      await createCalendarCandidate(invitation({ method: "PUBLISH" })),
    ];
  },
};
const unsupportedOutcomes = await processMessage(
  { id: 43, junk: false },
  { ...dependencies, extractors: [unsupportedCalendarExtractor] }
);
assert.equal(unsupportedOutcomes[0].status, "unsupported");
assert.equal(calls.length, 1, "plain ICS exports do not reach the calendar gateway");

const disabledOutcomes = await processMessage(
  { id: 44, junk: false },
  { ...dependencies, settings: { ...dependencies.settings, enabled: false } },
  { ignoreDisabled: true }
);
assert.equal(disabledOutcomes[0].status, "staged", "manual scans ignore the incoming-mail switch");

let markedAfterCalendarError = false;
const calendarErrorOutcomes = await processMessage(
  { id: 45, junk: false },
  {
    ...dependencies,
    calendarGateway: {
      async stage() {
        return { status: "calendarError", pending: false };
      },
    },
    processedStore: {
      ...dependencies.processedStore,
      async mark() {
        markedAfterCalendarError = true;
      },
    },
  }
);
assert.equal(calendarErrorOutcomes[0].status, "calendarError");
assert.equal(markedAfterCalendarError, false, "calendar failures remain retryable");

const cancellationCandidate = await createCalendarCandidate(
  invitation({ method: "CANCEL", sequence: "2" })
);
const cancellationOutcomes = await processMessage(
  { id: 46, junk: false, date: "2026-09-02T10:00:00.000Z" },
  {
    ...dependencies,
    extractors: [{ async extract() { return [cancellationCandidate]; } }],
    calendarGateway: {
      async stage() {
        return {
          status: "cancellationPending",
          pending: false,
          cancellations: [
            {
              calendarId: "calendar-1",
              itemId: "meeting@example.test",
              calendarName: "Synthetic calendar",
              title: "Planning",
              allDay: false,
              recurrenceId: null,
            },
          ],
        };
      },
    },
  }
);
assert.equal(cancellationOutcomes[0].status, "cancellationPending");
assert.equal(trackedCancellations.length, 1);
assert.equal(trackedCancellations[0].sourceId, cancellationCandidate.fingerprint);
assert.equal(trackedCancellations[0].icalText, cancellationCandidate.icalText);
assert.equal(trackedCancellations[0].receivedAt, Date.parse("2026-09-02T10:00:00.000Z"));
assert.equal(cancellationMarkers.length, 1);
assert.deepEqual(cancellationMarkers[0].eventScopes, cancellationCandidate.eventScopes);

await processMessage(
  { id: 48, junk: false, date: "2026-09-02T12:00:00.000Z" },
  {
    ...dependencies,
    extractors: [{ async extract() { return [cancellationCandidate]; } }],
    calendarGateway: {
      async stage() {
        return { status: "alreadyProcessed", pending: false };
      },
    },
  }
);
assert.equal(
  cancellationMarkers.length,
  1,
  "an unmatched cancellation cannot create a suppression marker"
);

const gatewayCallCount = calls.length;
const cancelledRequestOutcomes = await processMessage(
  { id: 47, junk: false, date: "2026-09-02T09:00:00.000Z" },
  {
    ...dependencies,
    processedStore: {
      ...dependencies.processedStore,
      async isCancelled() { return true; },
    },
  }
);
assert.equal(cancelledRequestOutcomes[0].status, "cancelled");
assert.equal(calls.length, gatewayCallCount, "an older cancelled request is not staged");