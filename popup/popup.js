localizeDocument();

const activity = document.querySelector("#activity");
const pendingCount = document.querySelector("#pending-count");
const cancellationCount = document.querySelector("#cancellation-count");
const result = document.querySelector("#result");
const manualScanButton = document.querySelector("#manual-scan");
const clearButton = document.querySelector("#clear");
const openReviewButton = document.querySelector("#open-review");
const settingsButton = document.querySelector("#settings");
let currentState = null;

manualScanButton.addEventListener("click", async () => {
  await runBusy(manualScanButton, async () => {
    const summary = await messenger.runtime.sendMessage({ type: "scanHistory" });
    if (summary.calendarErrorCount > 0) {
      result.textContent = summary.stagedCount > 0
        ? message("historyScanCalendarPartial", [summary.historyDays, summary.stagedCount])
        : message("calendarUnresponsive");
    } else if (summary.error) {
      result.textContent = summary.stagedCount > 0
        ? message(
          "historyScanPartial",
          [summary.historyDays, summary.stagedCount, summary.errorCount]
        )
        : message("historyScanReadErrors", [summary.historyDays, summary.errorCount]);
    } else if (summary.noCalendarCount > 0) {
      result.textContent = summary.stagedCount > 0
        ? message("historyScanNoCalendarPartial", [
          summary.historyDays,
          summary.stagedCount,
          summary.noCalendarCount,
        ])
        : message("calendarMissing");
    } else if (summary.cancellationCount > 0 || summary.stagedCount > 0) {
      result.textContent = message(
        "manualScanComplete",
        [summary.historyDays, summary.stagedCount, summary.cancellationCount]
      );
    } else {
      result.textContent = message("historyScanNothing", summary.historyDays);
    }
  });
  await refreshState();
});

clearButton.addEventListener("click", async () => {
  if (!confirm(message("confirmClear"))) {
    return;
  }
  await runBusy(clearButton, async () => {
    const summary = await messenger.runtime.sendMessage({ type: "clearPreviews" });
    result.textContent = summary.failedCount > 0
      ? message("removePreviewsPartial", [summary.removedCount, summary.failedCount])
      : message("removedPreviews", summary.removedCount);
  });
  await refreshState();
});

settingsButton.addEventListener("click", () => messenger.runtime.openOptionsPage());
openReviewButton.addEventListener("click", async () => {
  await messenger.runtime.sendMessage({
    type: "openReview",
    section: currentState?.pendingCount > 0 ? "invitations" : "cancellations",
  });
  window.close();
});

await refreshState();

async function refreshState() {
  currentState = await messenger.runtime.sendMessage({ type: "getState" });
  pendingCount.textContent = String(currentState.pendingCount);
  cancellationCount.textContent = String(currentState.cancellationCount);
  activity.textContent = message(currentState.enabled ? "active" : "inactive");
  clearButton.disabled = currentState.pendingCount === 0;
}

async function runBusy(button, operation) {
  button.disabled = true;
  result.textContent = "";
  try {
    await operation();
  } catch (error) {
    console.error(error);
    result.textContent = message("operationFailed");
  } finally {
    button.disabled = false;
  }
}

function localizeDocument() {
  document.documentElement.lang = messenger.i18n.getUILanguage();
  for (const element of document.querySelectorAll("[data-i18n]")) {
    element.textContent = message(element.dataset.i18n);
  }
}

function message(key, substitutions) {
  return messenger.i18n.getMessage(key, substitutions);
}