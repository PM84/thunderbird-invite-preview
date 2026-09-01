import assert from "node:assert/strict";

import { processMessage } from "../src/application/process-message.js";
import { createCalendarCandidate } from "../src/core/calendar-candidate.js";
import { invitation } from "./fixtures.js";

const candidate = await createCalendarCandidate(invitation());
const calls = [];
const tracked = [];
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