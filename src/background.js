import { processMessage } from "./application/process-message.js";
import {
  createHistoryQuery,
  isHistoricalIncomingMessage,
} from "./application/history-scan.js";
import { removeTrackedPreviews } from "./application/remove-previews.js";
import { summarizeOutcomes } from "./application/summarize-outcomes.js";
import { IcsExtractor } from "./extractors/ics-extractor.js";
import { ExtensionStateStore } from "./infrastructure/extension-state-store.js";

const stateStore = new ExtensionStateStore(messenger.storage.local);
const extractors = [new IcsExtractor(messenger.messages)];
const processingMessages = new Set();
let historyScanPromise = null;
let restorePromise = null;

const calendarGateway = {
  stage(candidate, details) {
    return messenger.invitationPreview.stage(candidate.icalText, details);
  },
};

messenger.messages.onNewMailReceived.addListener((_folder, messageList) => {
  void processMessageList(messageList);
});

messenger.invitationPreview.onResolved.addListener(resolution => {
  void stateStore.resolveSource(resolution.sourceId);
});

messenger.invitationPreview.onTransferPending.addListener(transfer => {
  void stateStore.markTransferPending(transfer.sourceId, {
    targetCalendarId: transfer.targetCalendarId,
    participationStatus: transfer.participationStatus,
  });
});

messenger.runtime.onInstalled.addListener(() => {
  void initializePreviews();
});

messenger.runtime.onStartup.addListener(() => {
  void initializePreviews();
});

messenger.runtime.onMessage.addListener(request => {
  switch (request?.type) {
    case "getState":
      return getState();
    case "scanDisplayed":
      return scanDisplayedMessage();
    case "scanHistory":
      return startHistoryScan();
    case "clearPreviews":
      return clearPreviews();
    default:
      return undefined;
  }
});

async function processMessageList(initialList, options = {}) {
  let messageList = initialList;
  const outcomes = [];

  while (messageList) {
    const messages = options.newestFirst
      ? [...messageList.messages].sort(
        (first, second) => new Date(second.date) - new Date(first.date)
      )
      : messageList.messages;
    for (const message of messages) {
      if (!options.filter || options.filter(message)) {
        const messageOutcomes = await processMessageSafely(message, options);
        outcomes.push(...messageOutcomes);
        if (
          options.stopOnCalendarError &&
          messageOutcomes.some(outcome => outcome.status === "calendarError")
        ) {
          return outcomes;
        }
      }
    }
    messageList = messageList.id
      ? await messenger.messages.continueList(messageList.id)
      : null;
  }

  return outcomes;
}

async function processMessageSafely(message, options = {}) {
  if (processingMessages.has(message.id)) {
    return [{ status: "alreadyScanning" }];
  }
  processingMessages.add(message.id);

  try {
    const settings = await stateStore.getSettings();
    return await processMessage(
      message,
      { extractors, calendarGateway, processedStore: stateStore, settings },
      options
    );
  } catch (error) {
    console.error("Invite Preview could not scan a message", error);
    return [{ status: "error" }];
  } finally {
    processingMessages.delete(message.id);
  }
}

async function scanDisplayedMessage() {
  await restorePreviews();
  const messageList = await messenger.messageDisplay.getDisplayedMessages();
  const outcomes = await processMessageList(messageList, {
    force: true,
    ignoreDisabled: true,
  });
  return summarizeOutcomes(outcomes);
}

async function scanHistory() {
  await restorePreviews();
  const settings = await stateStore.getSettings();
  try {
    const messageList = await messenger.messages.query(
      createHistoryQuery(settings.historyDays)
    );
    const outcomes = await processMessageList(messageList, {
      filter: isHistoricalIncomingMessage,
      ignoreDisabled: true,
      newestFirst: true,
      stopOnCalendarError: true,
    });
    return { ...summarizeOutcomes(outcomes), historyDays: settings.historyDays };
  } catch (error) {
    console.error("Invite Preview could not query message history", error);
    return {
      ...summarizeOutcomes([{ status: "error" }]),
      historyDays: settings.historyDays,
    };
  }
}

function startHistoryScan() {
  if (!historyScanPromise) {
    historyScanPromise = scanHistory().finally(() => {
      historyScanPromise = null;
    });
  }
  return historyScanPromise;
}

async function getState() {
  await restorePreviews();
  await reconcilePreviews();
  const [settings, previews] = await Promise.all([
    stateStore.getSettings(),
    stateStore.listPreviews(),
  ]);
  return {
    enabled: settings.enabled,
    pendingCount: previews.length,
  };
}

async function reconcilePreviews() {
  const previews = await stateStore.listPreviews();
  if (previews.length === 0) {
    return;
  }
  const references = previews.map(previewReference);
  const pendingReferences = await messenger.invitationPreview.inspect(references);
  const pendingKeys = new Set(
    pendingReferences.map(reference => JSON.stringify([reference.calendarId, reference.itemId]))
  );
  await stateStore.replacePreviews(
    previews.filter(preview =>
      pendingKeys.has(JSON.stringify([preview.calendarId, preview.itemId]))
    )
  );
}

async function clearPreviews() {
  await restorePreviews();
  const previews = await stateStore.listPreviews();
  const summary = await removeTrackedPreviews(
    previews,
    (calendarId, itemId) => messenger.invitationPreview.remove(calendarId, itemId)
  );
  await stateStore.replacePreviews(summary.remainingPreviews);
  return {
    removedCount: summary.removedCount,
    failedCount: summary.failedCount,
  };
}

async function initializePreviews() {
  await restorePreviews();
  await reconcilePreviews();
}

function restorePreviews() {
  if (!restorePromise) {
    restorePromise = restorePreviewsNow().finally(() => {
      restorePromise = null;
    });
  }
  return restorePromise;
}

async function restorePreviewsNow() {
  const previews = await stateStore.listPreviews();
  if (previews.length === 0) {
    return;
  }

  const references = previews.map(previewReference);
  const existingReferences = await messenger.invitationPreview.inspect(references);
  const existingKeys = new Set(
    existingReferences.map(reference =>
      JSON.stringify([reference.calendarId, reference.itemId])
    )
  );
  const restoredPreviews = [];

  for (const preview of previews) {
    const key = JSON.stringify([preview.calendarId, preview.itemId]);
    if (existingKeys.has(key)) {
      restoredPreviews.push(preview);
      continue;
    }
    if (!preview.icalText) {
      continue;
    }

    const outcome = await messenger.invitationPreview.stage(preview.icalText, {
      sourceId: preview.sourceId,
      preferredCalendarId: preview.preferredCalendarId || null,
      targetCalendarId: preview.targetCalendarId || null,
      participationStatus: preview.participationStatus || null,
    });
    if (outcome.pending && outcome.calendarId && outcome.itemId) {
      restoredPreviews.push({
        ...preview,
        calendarId: outcome.calendarId,
        itemId: outcome.itemId,
      });
    } else if (
      outcome.status === "calendarError" ||
      (preview.participationStatus && outcome.status === "noCalendar")
    ) {
      restoredPreviews.push(preview);
    }
  }

  await stateStore.replacePreviews(restoredPreviews);
}

function previewReference({ calendarId, itemId, preferredCalendarId }) {
  return {
    calendarId,
    itemId,
    preferredCalendarId: preferredCalendarId || null,
  };
}
