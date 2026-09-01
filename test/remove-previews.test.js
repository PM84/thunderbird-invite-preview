import assert from "node:assert/strict";

import { removeTrackedPreviews } from "../src/application/remove-previews.js";

const previews = [
  { calendarId: "calendar-1", itemId: "event-1" },
  { calendarId: "calendar-2", itemId: "event-2" },
  { calendarId: "calendar-3", itemId: "event-3" },
];
const calls = [];
const result = await removeTrackedPreviews(previews, async (calendarId, itemId) => {
  calls.push([calendarId, itemId]);
  if (itemId === "event-2") {
    throw new Error("calendar unavailable");
  }
  return itemId !== "event-3";
});

assert.deepEqual(calls, [
  ["calendar-1", "event-1"],
  ["calendar-2", "event-2"],
  ["calendar-3", "event-3"],
]);
assert.equal(result.removedCount, 1);
assert.equal(result.failedCount, 2);
assert.deepEqual(result.remainingPreviews, previews.slice(1));
