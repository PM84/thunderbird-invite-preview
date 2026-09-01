import assert from "node:assert/strict";

import { summarizeOutcomes } from "../src/application/summarize-outcomes.js";

assert.deepEqual(
  summarizeOutcomes([
    { status: "staged" },
    { status: "updated" },
    { status: "noCalendar" },
    { status: "noCalendar" },
    { status: "error" },
    { status: "calendarError" },
  ]),
  {
    scannedCount: 6,
    stagedCount: 2,
    noCalendarCount: 2,
    error: true,
    errorCount: 1,
    calendarErrorCount: 1,
  }
);
