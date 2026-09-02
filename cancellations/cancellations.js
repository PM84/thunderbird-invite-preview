localizeDocument();

const listView = document.querySelector("#list-view");
const detailView = document.querySelector("#detail-view");
const reviewList = document.querySelector("#review-list");
const reviewCount = document.querySelector("#review-count");
const emptyState = document.querySelector("#empty-state");
const deleteAllButton = document.querySelector("#delete-all");
const closeButton = document.querySelector("#close");
const backButton = document.querySelector("#back");
const previousButton = document.querySelector("#previous");
const nextButton = document.querySelector("#next");
const deleteOneButton = document.querySelector("#delete-one");
const dismissButton = document.querySelector("#dismiss");
const position = document.querySelector("#position");
const detailTitle = document.querySelector("#detail-title");
const detailCalendar = document.querySelector("#detail-calendar");
const detailDate = document.querySelector("#detail-date");
const detailOrganizer = document.querySelector("#detail-organizer");
const organizerRow = document.querySelector("#organizer-row");
const detailReceived = document.querySelector("#detail-received");
const detailError = document.querySelector("#detail-error");
const status = document.querySelector("#status");

let reviews = [];
let selectedId = null;

setIconLabel(closeButton, "closeWindow");
setIconLabel(backButton, "backToCancellationList");
setIconLabel(previousButton, "previousCancellation");
setIconLabel(nextButton, "nextCancellation");

closeButton.addEventListener("click", () => window.close());
backButton.addEventListener("click", showList);
previousButton.addEventListener("click", () => moveSelection(-1));
nextButton.addEventListener("click", () => moveSelection(1));
deleteOneButton.addEventListener("click", deleteSelected);
dismissButton.addEventListener("click", dismissSelected);
deleteAllButton.addEventListener("click", deleteAll);
window.addEventListener("focus", () => void refresh());
messenger.runtime.onMessage.addListener(request => {
  if (request?.type === "cancellationReviewsChanged") {
    void refresh();
  }
});

await refresh();

async function refresh() {
  reviews = await messenger.runtime.sendMessage({ type: "getCancellationReviews" });
  if (selectedId && !reviews.some(review => review.id === selectedId)) {
    selectedId = null;
  }
  renderList();
  if (selectedId) {
    renderDetail();
  } else {
    showList();
  }
}

function renderList() {
  reviewCount.textContent = String(reviews.length);
  emptyState.hidden = reviews.length !== 0;
  reviewList.hidden = reviews.length === 0;
  deleteAllButton.disabled = reviews.length === 0;
  reviewList.replaceChildren();

  for (const review of reviews) {
    const listItem = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "review-row";
    button.addEventListener("click", () => showDetail(review.id));

    const text = document.createElement("span");
    text.className = "review-row-text";
    const title = document.createElement("span");
    title.className = "review-row-title";
    title.textContent = review.title || message("untitledEvent");
    const meta = document.createElement("span");
    meta.className = "review-row-meta";
    meta.textContent = [review.calendarName, formatEventDate(review)]
      .filter(Boolean)
      .join(" · ");
    text.append(title, meta);

    const chevron = document.createElement("span");
    chevron.className = "review-row-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";
    button.append(text, chevron);
    listItem.append(button);
    reviewList.append(listItem);
  }
}

function showList() {
  selectedId = null;
  detailView.hidden = true;
  listView.hidden = false;
  detailError.textContent = "";
}

function showDetail(id) {
  selectedId = id;
  listView.hidden = true;
  detailView.hidden = false;
  renderDetail();
}

function renderDetail() {
  const index = selectedIndex();
  const review = reviews[index];
  if (!review) {
    showList();
    return;
  }

  position.textContent = message("cancellationPosition", [index + 1, reviews.length]);
  previousButton.disabled = index <= 0;
  nextButton.disabled = index >= reviews.length - 1;
  detailTitle.textContent = review.title || message("untitledEvent");
  detailCalendar.textContent = review.calendarName;
  detailDate.textContent = formatEventDate(review) || message("dateUnavailable");
  detailOrganizer.textContent = review.organizer || "";
  organizerRow.hidden = !review.organizer;
  detailReceived.textContent = formatDateTime(review.lastSeenAt);
  detailError.textContent = review.lastError
    ? message("cancellationPreviousError")
    : "";
}

function moveSelection(offset) {
  const index = selectedIndex() + offset;
  if (index >= 0 && index < reviews.length) {
    selectedId = reviews[index].id;
    renderDetail();
  }
}

async function deleteSelected() {
  const review = reviews[selectedIndex()];
  if (!review || !confirm(message("confirmDeleteCancellation", review.title))) {
    return;
  }

  const index = selectedIndex();
  await runBusy([deleteOneButton, dismissButton], async () => {
    const outcome = await messenger.runtime.sendMessage({
      type: "deleteCancellation",
      id: review.id,
    });
    if (outcome.status === "deleted" || outcome.status === "missing") {
      status.textContent = message("cancellationDeleted");
      await refreshAfterRemoval(index);
    } else if (outcome.status === "mismatch") {
      detailError.textContent = message("cancellationMismatch");
    } else {
      detailError.textContent = message("cancellationDeleteFailed");
    }
  });
}

async function dismissSelected() {
  const review = reviews[selectedIndex()];
  if (!review) {
    return;
  }
  const index = selectedIndex();
  await messenger.runtime.sendMessage({
    type: "dismissCancellation",
    id: review.id,
  });
  status.textContent = message("cancellationDismissed");
  await refreshAfterRemoval(index);
}

async function deleteAll() {
  if (!confirm(message("confirmDeleteAllCancellations", reviews.length))) {
    return;
  }
  await runBusy([deleteAllButton], async () => {
    const summary = await messenger.runtime.sendMessage({
      type: "deleteAllCancellations",
    });
    status.textContent = summary.failedCount > 0
      ? message("cancellationsDeletePartial", [
        summary.deletedCount,
        summary.failedCount,
      ])
      : message("cancellationsDeleted", summary.deletedCount);
    await refresh();
  });
}

async function refreshAfterRemoval(previousIndex) {
  selectedId = null;
  reviews = await messenger.runtime.sendMessage({ type: "getCancellationReviews" });
  renderList();
  if (reviews.length === 0) {
    showList();
    return;
  }
  showDetail(reviews[Math.min(previousIndex, reviews.length - 1)].id);
}

async function runBusy(buttons, operation) {
  buttons.forEach(button => { button.disabled = true; });
  detailError.textContent = "";
  try {
    await operation();
  } catch (error) {
    console.error(error);
    detailError.textContent = message("cancellationDeleteFailed");
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function selectedIndex() {
  return reviews.findIndex(review => review.id === selectedId);
}

function formatEventDate(review) {
  if (!review.startDate) {
    return "";
  }
  const start = new Date(review.startDate);
  if (Number.isNaN(start.getTime())) {
    return "";
  }
  const options = review.allDay
    ? { dateStyle: "medium" }
    : { dateStyle: "medium", timeStyle: "short" };
  return new Intl.DateTimeFormat(messenger.i18n.getUILanguage(), options).format(start);
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? message("dateUnavailable")
    : new Intl.DateTimeFormat(messenger.i18n.getUILanguage(), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
}

function setIconLabel(element, key) {
  const label = message(key);
  element.setAttribute("aria-label", label);
  element.title = label;
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
