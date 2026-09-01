const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const EXCLUDED_FOLDER_TYPES = new Set([
  "drafts",
  "junk",
  "outbox",
  "sent",
  "templates",
  "trash",
]);

export function createHistoryQuery(historyDays, now = new Date()) {
  return {
    fromDate: new Date(now.getTime() - historyDays * MILLISECONDS_PER_DAY),
    junk: false,
    toMe: true,
  };
}

export function isHistoricalIncomingMessage(message) {
  const specialUses = message.folder?.specialUse || [];
  return !specialUses.some(type => EXCLUDED_FOLDER_TYPES.has(type));
}