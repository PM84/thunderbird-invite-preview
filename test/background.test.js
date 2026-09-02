import assert from "node:assert/strict";

import { invitation } from "./fixtures.js";

const data = {
  pendingPreviews: Object.fromEntries([
    preview("source-1", "preview-calendar", "event-1", {
      preferredCalendarId: "fallback-calendar",
    }),
    preview("source-2", "preview-calendar", "event-2", {
      icalText: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
    }),
    preview("source-3", "preview-calendar", "event-3"),
    preview("source-4", "preview-calendar", "event-4", {
      icalText: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
      targetCalendarId: "target-calendar",
      participationStatus: "ACCEPTED",
    }),
  ]),
  pendingCancellations: {
    "review-1": {
      id: "review-1",
      sourceId: "cancel-source",
      icalText: "BEGIN:VCALENDAR\r\nMETHOD:CANCEL\r\nEND:VCALENDAR\r\n",
      calendarId: "target-calendar",
      itemId: "cancelled-event",
      recurrenceId: null,
      calendarName: "Synthetic calendar",
      title: "Synthetic cancellation",
      allDay: false,
      receivedAt: 200,
      firstSeenAt: 200,
      lastSeenAt: 200,
      receivedCount: 1,
      lastError: null,
    },
  },
};
const storage = {
  async get(key) {
    return { [key]: structuredClone(data[key]) };
  },
  async set(values) {
    Object.assign(data, structuredClone(values));
  },
};

const newMailEvent = createEvent();
const resolvedEvent = createEvent();
const transferPendingEvent = createEvent();
const installedEvent = createEvent();
const startupEvent = createEvent();
const messageEvent = createEvent();
const windowRemovedEvent = createEvent();
let inspectCount = 0;
const inspectCalls = [];
const stageCalls = [];
let queryCount = 0;
let resolveQuery;
const createdWindows = [];
const focusedWindows = [];
const deletedCancellations = [];
const sentRuntimeMessages = [];

globalThis.messenger = {
  storage: { local: storage },
  messages: {
    onNewMailReceived: newMailEvent,
    async listInlineTextParts(messageId) {
      return messageId >= 100
        ? [{
          contentType: "text/calendar",
          content: invitation({
            method: "CANCEL",
            uid: `cancelled-${messageId}@example.test`,
            sequence: "2",
          }),
        }]
        : [];
    },
    async listAttachments() {
      return [];
    },
    async query() {
      queryCount += 1;
      return new Promise(resolve => {
        resolveQuery = resolve;
      });
    },
  },
  invitationPreview: {
    onResolved: resolvedEvent,
    onTransferPending: transferPendingEvent,
    async inspect(references) {
      inspectCount += 1;
      inspectCalls.push(references);
      return inspectCount === 1 ? [references[0]] : references;
    },
    async stage(icalText, details) {
      stageCalls.push({ icalText, details });
      if (details.sourceId === "source-2") {
        return {
          status: "staged",
          pending: true,
          calendarId: "preview-calendar",
          itemId: "event-2-restored",
        };
      }
      if (icalText.includes("METHOD:CANCEL")) {
        const itemId = icalText.match(/UID:([^\r\n]+)/)?.[1];
        return {
          status: "cancellationPending",
          pending: false,
          cancellations: [{
            calendarId: "target-calendar",
            itemId,
            calendarName: "Synthetic calendar",
            title: "Synthetic cancellation",
            allDay: false,
            recurrenceId: null,
          }],
        };
      }
      return { status: "noCalendar", pending: false };
    },
    async remove() {
      return true;
    },
    async deleteCancellation(icalText, calendarId, itemId, recurrenceId) {
      deletedCancellations.push({ icalText, calendarId, itemId, recurrenceId });
      return {
        status: itemId === "cancelled-101@example.test"
          ? "calendarError"
          : "deleted",
      };
    },
  },
  runtime: {
    onInstalled: installedEvent,
    onStartup: startupEvent,
    onMessage: messageEvent,
    getURL(path) {
      return `moz-extension://synthetic.example.test/${path}`;
    },
    async sendMessage(message) {
      sentRuntimeMessages.push(message);
    },
  },
  windows: {
    onRemoved: windowRemovedEvent,
    async create(details) {
      createdWindows.push(details);
      return { id: 42 };
    },
    async update(windowId, details) {
      focusedWindows.push({ windowId, details });
      return { id: windowId };
    },
  },
};

await import("../src/background.js");

const state = await messageEvent.fire({ type: "getState" });
assert.equal(state.pendingCount, 3);
assert.equal(state.cancellationCount, 1);
assert.equal(inspectCalls[0][0].preferredCalendarId, "fallback-calendar");
assert.equal(stageCalls.length, 2);
assert.deepEqual(stageCalls[1].details, {
  sourceId: "source-4",
  preferredCalendarId: null,
  targetCalendarId: "target-calendar",
  participationStatus: "ACCEPTED",
});
assert.deepEqual(
  Object.values(data.pendingPreviews).map(item => item.itemId),
  ["event-1", "event-2-restored", "event-4"]
);

const reviews = await messageEvent.fire({ type: "getCancellationReviews" });
assert.equal(reviews.length, 1);
assert.equal("icalText" in reviews[0], false);
assert.equal("sourceId" in reviews[0], false);
assert.equal("calendarId" in reviews[0], false);
assert.equal("itemId" in reviews[0], false);

await messageEvent.fire({ type: "openCancellationReview" });
await messageEvent.fire({ type: "openCancellationReview" });
assert.equal(createdWindows.length, 1);
assert.equal(createdWindows[0].type, "popup");
assert.equal("focused" in createdWindows[0], false);
assert.equal(focusedWindows.length, 1);

const deletion = await messageEvent.fire({
  type: "deleteCancellation",
  id: "review-1",
});
assert.equal(deletion.status, "deleted");
assert.equal(deletedCancellations.length, 1);
assert.equal(data.pendingCancellations["review-1"], undefined);

windowRemovedEvent.fire(42);
newMailEvent.fire(null, {
  messages: [
    { id: 100, junk: false, date: "2026-09-02T10:00:00.000Z" },
    { id: 101, junk: false, date: "2026-09-02T11:00:00.000Z" },
  ],
  id: null,
});
await waitFor(() => Object.keys(data.pendingCancellations).length === 2);
assert.equal(createdWindows.length, 2, "one cancellation batch opens one review window");
assert.deepEqual(sentRuntimeMessages.at(-1), {
  type: "cancellationReviewsChanged",
});

const deleteAllResult = await messageEvent.fire({ type: "deleteAllCancellations" });
assert.deepEqual(deleteAllResult, { deletedCount: 1, failedCount: 1 });
const remainingReviews = await messageEvent.fire({ type: "getCancellationReviews" });
assert.equal(remainingReviews.length, 1);
assert.equal(remainingReviews[0].lastError, "calendarError");

await messageEvent.fire({
  type: "dismissCancellation",
  id: remainingReviews[0].id,
});
assert.deepEqual(await messageEvent.fire({ type: "getCancellationReviews" }), []);

transferPendingEvent.fire({
  sourceId: "source-1",
  targetCalendarId: "target-calendar",
  participationStatus: "TENTATIVE",
});
await nextTask();
assert.equal(
  Object.values(data.pendingPreviews).find(item => item.sourceId === "source-1")
    .participationStatus,
  "TENTATIVE"
);

resolvedEvent.fire({ sourceId: "source-1" });
await nextTask();
assert.equal(
  Object.values(data.pendingPreviews).some(item => item.sourceId === "source-1"),
  false
);

const firstScan = messageEvent.fire({ type: "scanHistory" });
const secondScan = messageEvent.fire({ type: "scanHistory" });
assert.equal(firstScan, secondScan, "concurrent history scans share one promise");
await nextTask();
assert.equal(queryCount, 1);
resolveQuery({ messages: [], id: null });
await firstScan;

const thirdScan = messageEvent.fire({ type: "scanHistory" });
await nextTask();
assert.equal(queryCount, 2, "a completed history scan can be started again");
resolveQuery({ messages: [], id: null });
await thirdScan;

delete globalThis.messenger;

function createEvent() {
  let listener;
  return {
    addListener(registeredListener) {
      listener = registeredListener;
    },
    fire(...args) {
      return listener(...args);
    },
  };
}

function preview(sourceId, calendarId, itemId, extra = {}) {
  const value = { sourceId, calendarId, itemId, ...extra };
  return [JSON.stringify([calendarId, itemId]), value];
}

function nextTask() {
  return new Promise(resolve => setImmediate(resolve));
}

async function waitFor(condition) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) {
      return;
    }
    await nextTask();
  }
  assert.fail("Timed out waiting for background work");
}
