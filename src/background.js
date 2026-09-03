import { processMessage } from "./application/process-message.js";
import {
  createHistoryQuery,
  isHistoricalIncomingMessage,
} from "./application/history-scan.js";
import { removeTrackedPreviews } from "./application/remove-previews.js";
import { summarizeOutcomes } from "./application/summarize-outcomes.js";
import { createCalendarCandidate } from "./core/calendar-candidate.js";
import { IcsExtractor } from "./extractors/ics-extractor.js";
import { ExtensionStateStore } from "./infrastructure/extension-state-store.js";

const stateStore = new ExtensionStateStore(messenger.storage.local);
const extractors = [new IcsExtractor(messenger.messages)];
const processingMessages = new Set();
const respondingInvitations = new Set();
const deletingCancellations = new Set();
const RESPONSE_STATUSES = new Set(["ACCEPTED", "TENTATIVE", "DECLINED"]);
let historyScanPromise = null;
let restorePromise = null;
let cancellationWindowId = null;
let cancellationWindowPromise = null;

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
    replyPending: transfer.replyPending === true,
  });
});

messenger.runtime.onInstalled.addListener(() => {
  void initializeState();
});

messenger.runtime.onStartup.addListener(() => {
  void initializeState();
});

messenger.windows.onRemoved.addListener(windowId => {
  if (windowId === cancellationWindowId) {
    cancellationWindowId = null;
  }
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
    case "getCancellationReviews":
      return getCancellationReviews();
    case "getInvitationReviews":
      return getInvitationReviews();
    case "openReview":
      return openReview(request.section);
    case "openCancellationReview":
      return openReview("cancellations");
    case "acceptInvitation":
      return acceptInvitation(request.id);
    case "respondInvitation":
      return respondInvitation(request.id, request.participationStatus);
    case "acceptAllInvitations":
      return acceptAllInvitations();
    case "deleteCancellation":
      return deleteCancellation(request.id);
    case "deleteAllCancellations":
      return deleteAllCancellations();
    case "dismissCancellation":
      return dismissCancellation(request.id);
    default:
      return undefined;
  }
});

async function processMessageList(initialList, options = {}) {
  let messageList = initialList;
  const outcomes = [];
  let invitationDetected = false;
  let cancellationDetected = false;

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
        invitationDetected ||= messageOutcomes.some(
          outcome => outcome.status === "staged" || outcome.status === "updated"
        );
        cancellationDetected ||= messageOutcomes.some(
          outcome => outcome.status === "cancellationPending"
        );
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

  if (invitationDetected || cancellationDetected) {
    await notifyReviewItemsChanged();
    await openReview(cancellationDetected ? "cancellations" : "invitations").catch(error => {
      console.error("Invite Preview could not open the review window", error);
    });
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
  const cancellations = await stateStore.listCancellations();
  return {
    enabled: settings.enabled,
    pendingCount: previews.length,
    cancellationCount: cancellations.length,
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

async function initializeState() {
  await restorePreviews();
  await reconcilePreviews();
  const [previews, cancellations] = await Promise.all([
    stateStore.listPreviews(),
    stateStore.listCancellations(),
  ]);
  if (previews.length > 0 || cancellations.length > 0) {
    await openReview(previews.length > 0 ? "invitations" : "cancellations");
  }
}

async function getInvitationReviews() {
  const previews = await stateStore.listPreviews();
  return Promise.all(previews.map(publicInvitation));
}

async function getCancellationReviews() {
  return (await stateStore.listCancellations()).map(publicCancellation);
}

function openReview(section = "invitations") {
  section = section === "cancellations" ? "cancellations" : "invitations";
  if (!cancellationWindowPromise) {
    cancellationWindowPromise = openReviewNow(section).finally(() => {
      cancellationWindowPromise = null;
    });
  }
  return cancellationWindowPromise;
}

async function openReviewNow(section) {
  if (cancellationWindowId != null) {
    try {
      await messenger.windows.update(cancellationWindowId, { focused: true });
      await messenger.runtime.sendMessage({
        type: "showReviewSection",
        section,
      }).catch(() => {});
      return { windowId: cancellationWindowId };
    } catch {
      cancellationWindowId = null;
    }
  }

  const reviewWindow = await messenger.windows.create({
    url: `${messenger.runtime.getURL("cancellations/cancellations.html")}?section=${section}`,
    type: "popup",
    width: 720,
    height: 640,
  });
  cancellationWindowId = reviewWindow.id;
  await messenger.invitationPreview.playReminderSound().catch(() => false);
  return { windowId: cancellationWindowId };
}

async function acceptInvitation(id) {
  const outcome = await respondInvitation(id, "ACCEPTED");
  return outcome.status === "responded"
    ? { ...outcome, status: "accepted" }
    : outcome;
}

async function respondInvitation(id, requestedStatus) {
  const participationStatus = String(requestedStatus || "").toUpperCase();
  if (!RESPONSE_STATUSES.has(participationStatus)) {
    return { status: "mismatch", messageRead: false };
  }
  if (respondingInvitations.has(id)) {
    return { status: "busy", messageRead: false };
  }
  respondingInvitations.add(id);
  try {
    return await respondInvitationNow(id, participationStatus);
  } finally {
    respondingInvitations.delete(id);
  }
}

async function respondInvitationNow(id, participationStatus) {
  const preview = (await stateStore.listPreviews()).find(
    item => item.sourceId === id
  );
  if (!preview) {
    return { status: "missing", messageRead: false };
  }
  const outcome = await messenger.invitationPreview.respondPreview(
    preview.calendarId,
    preview.itemId,
    participationStatus,
    preview.participationStatus !== participationStatus ||
      preview.replyPending === true
  );
  if (outcome.status !== "responded") {
    if (outcome.status === "missing") {
      await stateStore.resolveSource(preview.sourceId);
      await notifyReviewItemsChanged();
    }
    return { ...outcome, messageRead: false };
  }
  await stateStore.resolveSource(preview.sourceId);
  const messageRead = await markSourceMessageRead(preview.sourceMessage);
  await notifyReviewItemsChanged();
  return { ...outcome, messageRead };
}

async function acceptAllInvitations() {
  const previews = await stateStore.listPreviews();
  let acceptedCount = 0;
  let failedCount = 0;
  let messageReadFailedCount = 0;
  for (const preview of previews) {
    const outcome = await acceptInvitation(preview.sourceId);
    if (outcome.status === "accepted") {
      acceptedCount += 1;
      if (!outcome.messageRead) {
        messageReadFailedCount += 1;
      }
    } else {
      failedCount += 1;
    }
  }
  return { acceptedCount, failedCount, messageReadFailedCount };
}

async function deleteCancellation(id) {
  if (deletingCancellations.has(id)) {
    return { status: "busy" };
  }
  deletingCancellations.add(id);
  try {
    const cancellation = await stateStore.getCancellation(id);
    if (!cancellation) {
      return { status: "missing" };
    }
    const outcome = await messenger.invitationPreview.deleteCancellation(
      cancellation.icalText,
      cancellation.calendarId,
      cancellation.itemId,
      cancellation.recurrenceId
    );
    if (outcome.status === "deleted" || outcome.status === "missing") {
      await stateStore.removeCancellation(id);
    } else {
      await stateStore.markCancellationError(id, outcome.status);
    }
    const messageRead =
      outcome.status === "deleted" || outcome.status === "missing"
        ? await markSourceMessageRead(cancellation.sourceMessage)
        : false;
    if (outcome.status === "deleted" || outcome.status === "missing") {
      await notifyReviewItemsChanged();
    }
    return { ...outcome, messageRead };
  } finally {
    deletingCancellations.delete(id);
  }
}

async function deleteAllCancellations() {
  const cancellations = await stateStore.listCancellations();
  let deletedCount = 0;
  let failedCount = 0;
  let messageReadFailedCount = 0;
  for (const cancellation of cancellations) {
    const outcome = await deleteCancellation(cancellation.id);
    if (outcome.status === "deleted" || outcome.status === "missing") {
      deletedCount += 1;
      if (!outcome.messageRead) {
        messageReadFailedCount += 1;
      }
    } else {
      failedCount += 1;
    }
  }
  return { deletedCount, failedCount, messageReadFailedCount };
}

async function dismissCancellation(id) {
  await stateStore.removeCancellation(id);
  await notifyReviewItemsChanged();
  return { status: "dismissed" };
}

async function publicInvitation(preview) {
  let details = preview;
  if ((!preview.title || !preview.startDate) && preview.icalText) {
    try {
      details = { ...await createCalendarCandidate(preview.icalText), ...preview };
    } catch {
      details = preview;
    }
  }
  return {
    id: preview.sourceId,
    title: details.title || "",
    startDate: details.startDate || "",
    endDate: details.endDate || "",
    allDay: Boolean(details.allDay),
    organizer: details.organizer || "",
    calendarName: preview.targetCalendarName || "",
    receivedAt: preview.receivedAt || 0,
  };
}

function publicCancellation(cancellation) {
  const publicFields = { ...cancellation };
  delete publicFields.icalText;
  delete publicFields.sourceId;
  delete publicFields.calendarId;
  delete publicFields.itemId;
  delete publicFields.recurrenceId;
  delete publicFields.sourceMessage;
  return publicFields;
}

async function markSourceMessageRead(sourceMessage) {
  if (!sourceMessage) {
    return false;
  }
  if (sourceMessage.messageId != null && sourceMessage.headerMessageId) {
    try {
      const message = await messenger.messages.get(sourceMessage.messageId);
      if (
        message.headerMessageId === sourceMessage.headerMessageId
      ) {
        await messenger.messages.update(sourceMessage.messageId, { read: true });
        return true;
      }
    } catch {
      // Continue with the broader stable Message-ID lookup.
    }
  }
  if (!sourceMessage.headerMessageId) {
    return false;
  }
  const queries = [
    ...(sourceMessage.folderId ? [{
      folderId: sourceMessage.folderId,
      headerMessageId: sourceMessage.headerMessageId,
    }] : []),
    { headerMessageId: sourceMessage.headerMessageId },
  ];
  for (const query of queries) {
    try {
      const message = await findFirstMessage(query);
      if (message) {
        await messenger.messages.update(message.id, { read: true });
        return true;
      }
    } catch {
      // The message may have moved again; try the next lookup scope.
    }
  }
  return false;
}

async function findFirstMessage(query) {
  let messageList = await messenger.messages.query(query);
  while (messageList) {
    if (messageList.messages[0]) {
      return messageList.messages[0];
    }
    messageList = messageList.id
      ? await messenger.messages.continueList(messageList.id)
      : null;
  }
  return null;
}

function notifyReviewItemsChanged() {
  return messenger.runtime.sendMessage({ type: "reviewItemsChanged" }).catch(() => {});
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
      ...(preview.replyPending === true ? { replyPending: true } : {}),
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
