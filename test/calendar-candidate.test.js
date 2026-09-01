import assert from "node:assert/strict";

import { createCalendarCandidate } from "../src/core/calendar-candidate.js";
import { invitation } from "./fixtures.js";

const candidate = await createCalendarCandidate(invitation());

assert.equal(candidate.actionable, true);
assert.match(candidate.fingerprint, /^[a-f0-9]{64}$/);
assert.equal(candidate.icalText, invitation());