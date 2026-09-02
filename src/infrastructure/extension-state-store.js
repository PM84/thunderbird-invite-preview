const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  historyDays: 60,
  preferredCalendarId: null,
});

const SETTINGS_KEY = "settings";
const PROCESSED_KEY = "processedInvitations";
const PREVIEWS_KEY = "pendingPreviews";
const CANCELLATIONS_KEY = "pendingCancellations";
const CANCELLATION_MARKERS_KEY = "cancellationMarkers";
const MAX_PROCESSED_ENTRIES = 2000;
const MAX_CANCELLATIONS = 500;
const MAX_CANCELLATION_MARKERS = 2000;
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

  async trackCancellation(cancellation) {
    const id = await cancellationKey(cancellation);
    let storedCancellation;
    await this.#update(CANCELLATIONS_KEY, {}, cancellations => {
      const existing = cancellations[id];
      const isLatest = !existing || cancellation.receivedAt >= existing.lastSeenAt;
      storedCancellation = {
        ...existing,
        ...(isLatest ? cancellation : {}),
        id,
        firstSeenAt: Math.min(
          existing?.firstSeenAt ?? cancellation.receivedAt,
          cancellation.receivedAt
        ),
        lastSeenAt: Math.max(
          existing?.lastSeenAt ?? cancellation.receivedAt,
          cancellation.receivedAt
        ),
        receivedCount: (existing?.receivedCount || 0) + 1,
        lastError: isLatest ? null : existing.lastError,
      };
      cancellations[id] = storedCancellation;
      const entries = Object.entries(cancellations).sort(
        ([, first], [, second]) => second.lastSeenAt - first.lastSeenAt
      );
      return Object.fromEntries(entries.slice(0, MAX_CANCELLATIONS));
    });
    return storedCancellation;
  }

  async getCancellation(id) {
    await this.writeQueue;
    const stored = await this.storageArea.get(CANCELLATIONS_KEY);
    return stored[CANCELLATIONS_KEY]?.[id] || null;
  }

  async listCancellations() {
    await this.writeQueue;
    const stored = await this.storageArea.get(CANCELLATIONS_KEY);
    return Object.values(stored[CANCELLATIONS_KEY] || {}).sort(
      (first, second) => second.lastSeenAt - first.lastSeenAt
    );
  }

  async removeCancellation(id) {
    await this.#update(CANCELLATIONS_KEY, {}, cancellations => {
      delete cancellations[id];
      return cancellations;
    });
  }

  async markCancellationError(id, status) {
    await this.#update(CANCELLATIONS_KEY, {}, cancellations => {
      if (cancellations[id]) {
        cancellations[id] = {
          ...cancellations[id],
          lastError: status,
        };
      }
      return cancellations;
    });
  }

  async recordCancellation(eventScopes, recordedAt) {
    await this.#update(CANCELLATION_MARKERS_KEY, {}, markers => {
      for (const scope of eventScopes) {
        const existing = markers[scope.eventKey];
        if (!existing || scope.sequence >= existing.sequence) {
          markers[scope.eventKey] = {
            sequence: scope.sequence,
            recordedAt: Math.max(existing?.recordedAt || 0, recordedAt),
          };
        }
      }
      const entries = Object.entries(markers).sort(
        ([, first], [, second]) => second.recordedAt - first.recordedAt
      );
      return Object.fromEntries(entries.slice(0, MAX_CANCELLATION_MARKERS));
    });
  }

  async isCancelled(eventScopes) {
    await this.writeQueue;
    const primaryScope =
      eventScopes.find(scope => scope.recurrenceId === null) || eventScopes[0];
    if (!primaryScope) {
      return false;
    }
    const stored = await this.storageArea.get(CANCELLATION_MARKERS_KEY);
    const marker = stored[CANCELLATION_MARKERS_KEY]?.[primaryScope.eventKey];
    return Boolean(marker && marker.sequence >= primaryScope.sequence);
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

async function cancellationKey(cancellation) {
  const input = new TextEncoder().encode(
    JSON.stringify([
      cancellation.calendarId,
      cancellation.itemId,
      cancellation.recurrenceId || null,
    ])
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeHistoryDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days > 0 && days <= MAX_HISTORY_DAYS
    ? days
    : DEFAULT_SETTINGS.historyDays;
}