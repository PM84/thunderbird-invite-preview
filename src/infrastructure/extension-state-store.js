const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  historyDays: 60,
  preferredCalendarId: null,
});

const SETTINGS_KEY = "settings";
const PROCESSED_KEY = "processedInvitations";
const PREVIEWS_KEY = "pendingPreviews";
const MAX_PROCESSED_ENTRIES = 2000;
const MAX_HISTORY_DAYS = 3650;

export class ExtensionStateStore {
  constructor(storageArea) {
    this.storageArea = storageArea;
    this.writeQueue = Promise.resolve();
  }

  async getSettings() {
    await this.writeQueue;
    const stored = await this.storageArea.get(SETTINGS_KEY);
    return normalizeSettings(stored[SETTINGS_KEY]);
  }

  async has(sourceId) {
    await this.writeQueue;
    const stored = await this.storageArea.get(PROCESSED_KEY);
    return Boolean(stored[PROCESSED_KEY]?.[sourceId]);
  }

  async mark(sourceId) {
    await this.#update(PROCESSED_KEY, {}, processed => {
      processed[sourceId] = Date.now();
      const entries = Object.entries(processed).sort((first, second) => second[1] - first[1]);
      return Object.fromEntries(entries.slice(0, MAX_PROCESSED_ENTRIES));
    });
  }

  async trackPreview(preview) {
    await this.#update(PREVIEWS_KEY, {}, previews => {
      previews[previewKey(preview)] = preview;
      return previews;
    });
  }

  async resolveSource(sourceId) {
    await this.#update(PREVIEWS_KEY, {}, previews =>
      Object.fromEntries(
        Object.entries(previews).filter(([, preview]) => preview.sourceId !== sourceId)
      )
    );
  }

  async markTransferPending(sourceId, transfer) {
    await this.#update(PREVIEWS_KEY, {}, previews =>
      Object.fromEntries(
        Object.entries(previews).map(([key, preview]) => [
          key,
          preview.sourceId === sourceId ? { ...preview, ...transfer } : preview,
        ])
      )
    );
  }

  async listPreviews() {
    await this.writeQueue;
    const stored = await this.storageArea.get(PREVIEWS_KEY);
    return Object.values(stored[PREVIEWS_KEY] || {});
  }

  async replacePreviews(previews) {
    const indexed = Object.fromEntries(
      previews.map(preview => [previewKey(preview), preview])
    );
    await this.#update(PREVIEWS_KEY, {}, () => indexed);
  }

  async #update(key, fallback, updateValue) {
    this.writeQueue = this.writeQueue.then(async () => {
      const stored = await this.storageArea.get(key);
      const current = stored[key] || fallback;
      await this.storageArea.set({ [key]: updateValue(current) });
    });
    await this.writeQueue;
  }
}

export function normalizeSettings(value = {}) {
  return {
    enabled:
      typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    historyDays: normalizeHistoryDays(value.historyDays),
    preferredCalendarId:
      typeof value.preferredCalendarId === "string" && value.preferredCalendarId !== ""
        ? value.preferredCalendarId
        : DEFAULT_SETTINGS.preferredCalendarId,
  };
}

function previewKey(preview) {
  return JSON.stringify([preview.calendarId, preview.itemId]);
}

function normalizeHistoryDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days > 0 && days <= MAX_HISTORY_DAYS
    ? days
    : DEFAULT_SETTINGS.historyDays;
}