localizeDocument();

const activity = document.querySelector("#activity");
const pendingCount = document.querySelector("#pending-count");
const result = document.querySelector("#result");
const scanButton = document.querySelector("#scan");
const historyButton = document.querySelector("#scan-history");
const clearButton = document.querySelector("#clear");
const settingsButton = document.querySelector("#settings");

scanButton.addEventListener("click", async () => {
  await runBusy(scanButton, async () => {
    const summary = await messenger.runtime.sendMessage({ type: "scanDisplayed" });
    if (summary.calendarErrorCount > 0) {
      result.textContent = message("calendarUnresponsive");
    } else if (summary.error) {
      result.textContent = message("operationFailed");
    } else if (summary.noCalendarCount > 0) {
      result.textContent = summary.stagedCount > 0
        ? message("scanNoCalendarPartial", [
          summary.stagedCount,
          summary.noCalendarCount,
        ])
        : message("calendarMissing");
    } else if (summary.stagedCount > 0) {
      result.textContent = message("scanComplete", summary.stagedCount);
    } else {
      result.textContent = message("nothingFound");
    }
  });
  await refreshState();
});

historyButton.addEventListener("click", async () => {
  await runBusy(historyButton, async () => {
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
    } else if (summary.stagedCount > 0) {
      result.textContent = message(
        "historyScanComplete",
        [summary.historyDays, summary.stagedCount]
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

await refreshState();

async function refreshState() {
  const state = await messenger.runtime.sendMessage({ type: "getState" });
  pendingCount.textContent = String(state.pendingCount);
  activity.textContent = message(state.enabled ? "active" : "inactive");
  clearButton.disabled = state.pendingCount === 0;
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