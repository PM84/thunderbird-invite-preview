import assert from "node:assert/strict";

import { ExtensionStateStore } from "../src/infrastructure/extension-state-store.js";

const data = {};
const storage = {
  async get(key) {
    return { [key]: data[key] };
  },
  async set(values) {
    Object.assign(data, values);
  },
};
const store = new ExtensionStateStore(storage);

assert.deepEqual(await store.getSettings(), {
  enabled: true,
  historyDays: 60,
  preferredCalendarId: null,
});

await storage.set({ settings: { historyDays: -1 } });
assert.equal((await store.getSettings()).historyDays, 60);
await storage.set({ settings: { historyDays: 3651 } });
assert.equal((await store.getSettings()).historyDays, 60);
await storage.set({
  settings: {
    enabled: "yes",
    historyDays: 30,
    preferredCalendarId: 42,
    unexpected: true,
  },
});
assert.deepEqual(await store.getSettings(), {
  enabled: true,
  historyDays: 30,
  preferredCalendarId: null,
});

await Promise.all([store.mark("a"), store.mark("b")]);
assert.equal(await store.has("a"), true);
assert.equal(await store.has("b"), true);

await store.trackPreview({
  sourceId: "a",
  calendarId: "calendar-1",
  itemId: "item-1",
  title: "Planning",
});
assert.equal((await store.listPreviews()).length, 1);
await store.markTransferPending("a", {
  targetCalendarId: "calendar-2",
  participationStatus: "ACCEPTED",
});
assert.deepEqual(await store.listPreviews(), [
  {
    sourceId: "a",
    calendarId: "calendar-1",
    itemId: "item-1",
    title: "Planning",
    targetCalendarId: "calendar-2",
    participationStatus: "ACCEPTED",
  },
]);
await store.resolveSource("a");
assert.deepEqual(await store.listPreviews(), []);

const firstCancellation = await store.trackCancellation({
  sourceId: "cancel-1",
  calendarId: "calendar-1",
  itemId: "event-1",
  recurrenceId: null,
  title: "Synthetic event",
  receivedAt: 100,
});
assert.equal(firstCancellation.receivedCount, 1);
assert.match(firstCancellation.id, /^[a-f0-9]{64}$/);
assert.equal((await store.listCancellations()).length, 1);

const updatedCancellation = await store.trackCancellation({
  sourceId: "cancel-2",
  calendarId: "calendar-1",
  itemId: "event-1",
  recurrenceId: null,
  title: "Updated synthetic event",
  receivedAt: 200,
});
assert.equal(updatedCancellation.id, firstCancellation.id);
assert.equal(updatedCancellation.receivedCount, 2);
assert.equal(updatedCancellation.firstSeenAt, 100);
assert.equal(updatedCancellation.lastSeenAt, 200);
assert.equal((await store.listCancellations())[0].title, "Updated synthetic event");

await store.markCancellationError(firstCancellation.id, "calendarError");
assert.equal((await store.getCancellation(firstCancellation.id)).lastError, "calendarError");
const olderCancellation = await store.trackCancellation({
  sourceId: "cancel-older",
  calendarId: "calendar-1",
  itemId: "event-1",
  recurrenceId: null,
  title: "Older synthetic event",
  receivedAt: 50,
});
assert.equal(olderCancellation.title, "Updated synthetic event");
assert.equal(olderCancellation.firstSeenAt, 50);
assert.equal(olderCancellation.lastSeenAt, 200);
assert.equal(olderCancellation.receivedCount, 3);
assert.equal(olderCancellation.lastError, "calendarError");
await store.removeCancellation(firstCancellation.id);
assert.deepEqual(await store.listCancellations(), []);

const seriesScope = {
  eventKey: "a".repeat(64),
  recurrenceId: null,
  sequence: 2,
};
await store.recordCancellation([seriesScope], 300);
assert.equal(await store.isCancelled([{ ...seriesScope, sequence: 1 }]), true);
assert.equal(await store.isCancelled([{ ...seriesScope, sequence: 2 }]), true);
assert.equal(await store.isCancelled([{ ...seriesScope, sequence: 3 }]), false);
assert.equal(
  await store.isCancelled([{
    eventKey: "b".repeat(64),
    recurrenceId: null,
    sequence: 1,
  }]),
  false
);