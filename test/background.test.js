import assert from "node:assert/strict";

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
let inspectCount = 0;
const inspectCalls = [];
const stageCalls = [];
let queryCount = 0;
let resolveQuery;

globalThis.messenger = {
  storage: { local: storage },
  messages: {
    onNewMailReceived: newMailEvent,
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
      return { status: "noCalendar", pending: false };
    },
    async remove() {
      return true;
    },
  },
  runtime: {
    onInstalled: installedEvent,
    onStartup: startupEvent,
    onMessage: messageEvent,
  },
};

await import("../src/background.js");

const state = await messageEvent.fire({ type: "getState" });
assert.equal(state.pendingCount, 3);
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
