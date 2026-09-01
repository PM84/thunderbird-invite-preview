import assert from "node:assert/strict";

import {
  createHistoryQuery,
  isHistoricalIncomingMessage,
} from "../src/application/history-scan.js";

const now = new Date("2026-09-01T12:00:00.000Z");
const query = createHistoryQuery(60, now);
assert.equal(query.fromDate.toISOString(), "2026-07-03T12:00:00.000Z");
assert.equal(query.junk, false);
assert.equal(query.toMe, true);

assert.equal(
  isHistoricalIncomingMessage({ folder: { specialUse: ["inbox"] }, read: true }),
  true,
  "read inbox messages are included"
);
assert.equal(
  isHistoricalIncomingMessage({ folder: { specialUse: ["archives"] } }),
  true,
  "archived incoming messages are included"
);
for (const type of ["drafts", "junk", "outbox", "sent", "templates", "trash"]) {
  assert.equal(isHistoricalIncomingMessage({ folder: { specialUse: [type] } }), false);
}