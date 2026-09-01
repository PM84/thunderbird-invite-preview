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