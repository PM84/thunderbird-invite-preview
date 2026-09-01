import {
  MAX_ICAL_BYTES,
  createCalendarCandidate,
} from "../core/calendar-candidate.js";

const CALENDAR_CONTENT_TYPES = new Set([
  "application/ics",
  "application/icalendar",
  "text/calendar",
]);

export class IcsExtractor {
  constructor(messagesApi, logger = console) {
    this.messagesApi = messagesApi;
    this.logger = logger;
  }

  async extract(message) {
    const sourceResults = await Promise.allSettled([
      this.#readInlineParts(message.id),
      this.#readAttachments(message.id),
    ]);
    const candidates = new Map();

    for (const result of sourceResults) {
      if (result.status === "rejected") {
        this.logger.warn("Invite Preview could not read calendar message parts", result.reason);
      }
    }

    const sources = sourceResults
      .filter(result => result.status === "fulfilled")
      .flatMap(result => result.value);
    for (const source of sources) {
      try {
        const candidate = await createCalendarCandidate(source.icalText);
        candidates.set(candidate.fingerprint, candidate);
      } catch (error) {
        this.logger.warn("Invite Preview ignored invalid calendar data", error);
      }
    }

    return [...candidates.values()];
  }

  async #readInlineParts(messageId) {
    const parts = await this.messagesApi.listInlineTextParts(messageId);
    return parts
      .filter(part => normalizeContentType(part.contentType) === "text/calendar")
      .filter(part => byteLength(part.content) <= MAX_ICAL_BYTES)
      .map(part => ({
        icalText: part.content,
      }));
  }

  async #readAttachments(messageId) {
    const attachments = await this.messagesApi.listAttachments(messageId);
    const calendarAttachments = attachments.filter(isCalendarAttachment);
    const sources = [];

    for (const attachment of calendarAttachments) {
      if (attachment.size > MAX_ICAL_BYTES) {
        continue;
      }
      try {
        const file = await this.messagesApi.getAttachmentFile(messageId, attachment.partName);
        if (file.size > MAX_ICAL_BYTES) {
          continue;
        }
        sources.push({
          icalText: await file.text(),
        });
      } catch (error) {
        this.logger.warn("Invite Preview could not read a calendar attachment", error);
      }
    }

    return sources;
  }
}

function isCalendarAttachment(attachment) {
  const contentType = normalizeContentType(attachment.contentType);
  return (
    CALENDAR_CONTENT_TYPES.has(contentType) ||
    String(attachment.name).toLowerCase().endsWith(".ics")
  );
}

function normalizeContentType(contentType) {
  return String(contentType).split(";", 1)[0].trim().toLowerCase();
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}