import assert from "node:assert/strict";

import { createCalendarCandidate } from "../src/core/calendar-candidate.js";
import { invitation } from "./fixtures.js";

const candidate = await createCalendarCandidate(invitation());

assert.equal(candidate.actionable, true);
assert.equal(candidate.method, "REQUEST");
assert.equal(candidate.eventScopes.length, 1);
assert.match(candidate.eventScopes[0].eventKey, /^[a-f0-9]{64}$/);
assert.equal(candidate.eventScopes[0].recurrenceId, null);
assert.equal(candidate.eventScopes[0].sequence, 0);
assert.match(candidate.fingerprint, /^[a-f0-9]{64}$/);
assert.equal(candidate.icalText, invitation());