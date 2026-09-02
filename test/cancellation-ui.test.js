import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, script] = await Promise.all([
  readFile(new URL("../cancellations/cancellations.html", import.meta.url), "utf8"),
  readFile(new URL("../cancellations/cancellations.js", import.meta.url), "utf8"),
]);

for (const id of [
  "list-view",
  "review-list",
  "delete-all",
  "detail-view",
  "previous",
  "next",
  "delete-one",
  "dismiss",
]) {
  assert.match(html, new RegExp(`id="${id}"`));
}

assert.ok(
  html.indexOf('id="list-view"') < html.indexOf('id="detail-view"'),
  "the review window presents the complete list before the detail view"
);
assert.match(html, /<ul id="review-list"/);
assert.match(script, /document\.createElement\("li"\)/);
assert.match(script, /type: "deleteCancellation"/);
assert.match(script, /type: "deleteAllCancellations"/);
assert.match(script, /type: "dismissCancellation"/);
assert.match(script, /request\?\.type === "cancellationReviewsChanged"/);
assert.doesNotMatch(script, /invitationPreview\./);
assert.doesNotMatch(script, /icalText|calendarId|itemId/);
