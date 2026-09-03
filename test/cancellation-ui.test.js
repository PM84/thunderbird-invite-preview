import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [html, script, popupHtml, popupScript] = await Promise.all([
  readFile(new URL("../cancellations/cancellations.html", import.meta.url), "utf8"),
  readFile(new URL("../cancellations/cancellations.js", import.meta.url), "utf8"),
  readFile(new URL("../popup/popup.html", import.meta.url), "utf8"),
  readFile(new URL("../popup/popup.js", import.meta.url), "utf8"),
]);

for (const id of [
  "invitations-tab",
  "cancellations-tab",
  "list-view",
  "review-list",
  "accept-all",
  "delete-all",
  "detail-view",
  "previous",
  "next",
  "accept-invitation",
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
assert.match(script, /type: "getInvitationReviews"/);
assert.match(script, /type: "acceptInvitation"/);
assert.match(script, /type: "acceptAllInvitations"/);
assert.match(script, /type: "deleteCancellation"/);
assert.match(script, /type: "deleteAllCancellations"/);
assert.match(script, /type: "dismissCancellation"/);
assert.match(script, /request\?\.type === "reviewItemsChanged"/);
assert.match(script, /request\?\.type === "showReviewSection"/);
assert.doesNotMatch(script, /invitationPreview\./);
assert.doesNotMatch(script, /icalText|calendarId|itemId|sourceMessage|messageId/);

const popupMain = popupHtml.match(/<main>([\s\S]*?)<\/main>/)?.[1] || "";
assert.equal(
  [...popupMain.matchAll(/<button\b/g)].length,
  3,
  "the toolbar popup exposes exactly three primary workflow buttons"
);
for (const id of ["manual-scan", "clear", "open-review", "settings"]) {
  assert.match(popupHtml, new RegExp(`id="${id}"`));
}
assert.doesNotMatch(popupHtml, /id="scan"|id="scan-history"|id="review-cancellations"/);
assert.match(popupScript, /type: "scanHistory"/);
assert.match(popupScript, /type: "openReview"/);
