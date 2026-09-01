import assert from "node:assert/strict";

import { IcsExtractor } from "../src/extractors/ics-extractor.js";
import { invitation } from "./fixtures.js";

const warnings = [];
const messagesApi = {
  async listInlineTextParts() {
    return [
      { contentType: "text/plain", content: "Hello" },
      { contentType: "text/calendar; method=REQUEST", content: invitation() },
    ];
  },
  async listAttachments() {
    return [
      {
        name: "invite.ics",
        contentType: "application/octet-stream",
        partName: "1.2",
        size: invitation().length,
      },
    ];
  },
  async getAttachmentFile() {
    return {
      size: invitation().length,
      async text() {
        return invitation();
      },
    };
  },
};

const extractor = new IcsExtractor(messagesApi, {
  warn(...args) {
    warnings.push(args);
  },
});
const candidates = await extractor.extract({ id: 42 });

assert.equal(candidates.length, 1, "duplicate inline and attached invitations are collapsed");
assert.equal(candidates[0].actionable, true);
assert.deepEqual(warnings, []);

const partialExtractor = new IcsExtractor(
  {
    async listInlineTextParts() {
      throw new Error("message body unavailable");
    },
    async listAttachments() {
      return [
        {
          name: "invite.ics",
          contentType: "application/octet-stream",
          partName: "1.2",
          size: invitation().length,
        },
      ];
    },
    async getAttachmentFile() {
      return {
        size: invitation().length,
        async text() {
          return invitation();
        },
      };
    },
  },
  { warn(...args) { warnings.push(args); } }
);
const partialCandidates = await partialExtractor.extract({ id: 43 });
assert.equal(partialCandidates.length, 1, "one failed MIME source does not hide another");
assert.equal(warnings.length, 1);