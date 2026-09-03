localizeDocument();

const invitationsTab = document.querySelector("#invitations-tab");
const cancellationsTab = document.querySelector("#cancellations-tab");
const invitationCount = document.querySelector("#invitation-count");
const cancellationCount = document.querySelector("#cancellation-count");
const listView = document.querySelector("#list-view");
const detailView = document.querySelector("#detail-view");
const listHeading = document.querySelector("#list-heading");
const reviewList = document.querySelector("#review-list");
const reviewCount = document.querySelector("#review-count");
const emptyState = document.querySelector("#empty-state");
const listActions = document.querySelector("#list-actions");
const acceptAllButton = document.querySelector("#accept-all");
const deleteAllButton = document.querySelector("#delete-all");
const closeButton = document.querySelector("#close");
const backButton = document.querySelector("#back");
const previousButton = document.querySelector("#previous");
const nextButton = document.querySelector("#next");
const acceptInvitationButton = document.querySelector("#accept-invitation");
const deleteOneButton = document.querySelector("#delete-one");
const dismissButton = document.querySelector("#dismiss");
const invitationActions = document.querySelector("#invitation-actions");
const cancellationActions = document.querySelector("#cancellation-actions");
const position = document.querySelector("#position");
const detailKind = document.querySelector("#detail-kind");
const detailTitle = document.querySelector("#detail-title");
const detailCalendar = document.querySelector("#detail-calendar");
const calendarRow = document.querySelector("#calendar-row");
const detailDate = document.querySelector("#detail-date");
const detailOrganizer = document.querySelector("#detail-organizer");
const organizerRow = document.querySelector("#organizer-row");
const receivedLabel = document.querySelector("#received-label");
const detailReceived = document.querySelector("#detail-received");
const detailError = document.querySelector("#detail-error");
const status = document.querySelector("#status");

const initialSection = new URLSearchParams(location.search).get("section");
let activeSection = initialSection === "cancellations"
  ? "cancellations"
  : "invitations";
let invitationReviews = [];
let cancellationReviews = [];
let selectedId = null;

setIconLabel(closeButton, "closeWindow");
setIconLabel(backButton, "backToReviewList");
setIconLabel(previousButton, "previousReview");
setIconLabel(nextButton, "nextReview");
document.querySelector("#review-tabs").setAttribute(
  "aria-label",
  message("reviewCategories")
);
document.querySelector("#detail-navigation").setAttribute(
  "aria-label",
  message("reviewNavigation")
);

invitationsTab.addEventListener("click", () => switchSection("invitations"));
cancellationsTab.addEventListener("click", () => switchSection("cancellations"));
closeButton.addEventListener("click", () => window.close());
backButton.addEventListener("click", showList);
previousButton.addEventListener("click", () => moveSelection(-1));
nextButton.addEventListener("click", () => moveSelection(1));
acceptInvitationButton.addEventListener("click", acceptSelectedInvitation);
deleteOneButton.addEventListener("click", deleteSelectedCancellation);
dismissButton.addEventListener("click", dismissSelectedCancellation);
acceptAllButton.addEventListener("click", acceptAllInvitations);
deleteAllButton.addEventListener("click", deleteAllCancellations);
window.addEventListener("focus", () => void refresh());
messenger.runtime.onMessage.addListener(request => {
  if (request?.type === "reviewItemsChanged") {
    void refresh();
  } else if (request?.type === "showReviewSection") {
    switchSection(request.section);
  }
});

await refresh();

async function refresh() {
  [invitationReviews, cancellationReviews] = await Promise.all([
    messenger.runtime.sendMessage({ type: "getInvitationReviews" }),
    messenger.runtime.sendMessage({ type: "getCancellationReviews" }),
  ]);
  if (selectedId && !currentReviews().some(review => review.id === selectedId)) {
    selectedId = null;
  }
  renderTabs();
  renderList();
  if (selectedId) {
    renderDetail();
  } else {
    showList();
  }
}

function switchSection(section) {
  if (section !== "invitations" && section !== "cancellations") {
    return;
  }
  activeSection = section;
  selectedId = null;
  detailError.textContent = "";
  status.textContent = "";
  renderTabs();
  renderList();
  showList();
}

function renderTabs() {
  const invitationsActive = activeSection === "invitations";
  invitationsTab.setAttribute("aria-selected", String(invitationsActive));
  cancellationsTab.setAttribute("aria-selected", String(!invitationsActive));
  invitationCount.textContent = String(invitationReviews.length);
  cancellationCount.textContent = String(cancellationReviews.length);
}

function renderList() {
  const reviews = currentReviews();
  const invitationsActive = activeSection === "invitations";
  listHeading.textContent = message(
    invitationsActive ? "invitationReviewSummary" : "cancellationReviewSummary"
  );
  emptyState.textContent = message(
    invitationsActive ? "noInvitationReviews" : "noCancellationReviews"
  );
  reviewCount.textContent = String(reviews.length);
  emptyState.hidden = reviews.length !== 0;
  reviewList.hidden = reviews.length === 0;
  listActions.hidden = reviews.length === 0;
  acceptAllButton.hidden = !invitationsActive;
  acceptAllButton.disabled = reviews.length === 0;
  deleteAllButton.hidden = invitationsActive;
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
  const reviews = currentReviews();
  const index = selectedIndex();
  const review = reviews[index];
  if (!review) {
    showList();
    return;
  }

  const invitationsActive = activeSection === "invitations";
  position.textContent = message("reviewPosition", [index + 1, reviews.length]);
  previousButton.disabled = index <= 0;
  nextButton.disabled = index >= reviews.length - 1;
  detailKind.textContent = message(
    invitationsActive ? "invitationAwaitingResponse" : "cancelledInvitation"
  );
  detailTitle.textContent = review.title || message("untitledEvent");
  detailCalendar.textContent = review.calendarName || "";
  calendarRow.hidden = !review.calendarName;
  detailDate.textContent = formatEventDate(review) || message("dateUnavailable");
  detailOrganizer.textContent = review.organizer || "";
  organizerRow.hidden = !review.organizer;
  receivedLabel.textContent = message(
    invitationsActive ? "invitationReceived" : "cancellationReceived"
  );
  detailReceived.textContent = formatDateTime(
    invitationsActive ? review.receivedAt : review.lastSeenAt
  );
  detailError.textContent = !invitationsActive && review.lastError
    ? message("cancellationPreviousError")
    : "";
  invitationActions.hidden = !invitationsActive;
  cancellationActions.hidden = invitationsActive;
}

function moveSelection(offset) {
  const reviews = currentReviews();
  const index = selectedIndex() + offset;
  if (index >= 0 && index < reviews.length) {
    selectedId = reviews[index].id;
    renderDetail();
  }
}

async function acceptSelectedInvitation() {
  const review = currentReviews()[selectedIndex()];
  if (!review || !confirm(message("confirmAcceptInvitation", review.title))) {
    return;
  }
  const index = selectedIndex();
  await runBusy([acceptInvitationButton], async () => {
    const outcome = await messenger.runtime.sendMessage({
      type: "acceptInvitation",
      id: review.id,
    });
    if (outcome.status === "accepted") {
      status.textContent = message(
        outcome.messageRead ? "invitationAccepted" : "invitationAcceptedMailUnread"
      );
      await refreshAfterRemoval(index);
    } else if (outcome.status === "missing" || outcome.status === "mismatch") {
      detailError.textContent = message("invitationUnavailable");
    } else {
      detailError.textContent = message("invitationAcceptFailed");
    }
  });
}

async function deleteSelectedCancellation() {
  const review = currentReviews()[selectedIndex()];
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
      status.textContent = message(
        outcome.messageRead ? "cancellationDeleted" : "cancellationDeletedMailUnread"
      );
      await refreshAfterRemoval(index);
    } else if (outcome.status === "mismatch") {
      detailError.textContent = message("cancellationMismatch");
    } else {
      detailError.textContent = message("cancellationDeleteFailed");
    }
  });
}

async function acceptAllInvitations() {
  const reviews = currentReviews();
  if (!confirm(message("confirmAcceptAllInvitations", reviews.length))) {
    return;
  }
  await runBusy([acceptAllButton], async () => {
    const summary = await messenger.runtime.sendMessage({
      type: "acceptAllInvitations",
    });
    if (summary.failedCount > 0 && summary.messageReadFailedCount > 0) {
      status.textContent = message("invitationsAcceptPartialMailUnread", [
        summary.acceptedCount,
        summary.failedCount,
        summary.messageReadFailedCount,
      ]);
    } else if (summary.failedCount > 0) {
      status.textContent = message("invitationsAcceptPartial", [
        summary.acceptedCount,
        summary.failedCount,
      ]);
    } else if (summary.messageReadFailedCount > 0) {
      status.textContent = message("invitationsAcceptedMailUnread", [
        summary.acceptedCount,
        summary.messageReadFailedCount,
      ]);
    } else {
      status.textContent = message("invitationsAccepted", summary.acceptedCount);
    }
    await refresh();
  });
}

async function dismissSelectedCancellation() {
  const review = currentReviews()[selectedIndex()];
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

async function deleteAllCancellations() {
  const reviews = currentReviews();
  if (!confirm(message("confirmDeleteAllCancellations", reviews.length))) {
    return;
  }
  await runBusy([deleteAllButton], async () => {
    const summary = await messenger.runtime.sendMessage({
      type: "deleteAllCancellations",
    });
    if (summary.failedCount > 0) {
      status.textContent = message("cancellationsDeletePartial", [
        summary.deletedCount,
        summary.failedCount,
      ]);
    } else if (summary.messageReadFailedCount > 0) {
      status.textContent = message("cancellationsDeletedMailUnread", [
        summary.deletedCount,
        summary.messageReadFailedCount,
      ]);
    } else {
      status.textContent = message("cancellationsDeleted", summary.deletedCount);
    }
    await refresh();
  });
}

async function refreshAfterRemoval(previousIndex) {
  selectedId = null;
  await refresh();
  const reviews = currentReviews();
  if (reviews.length > 0) {
    showDetail(reviews[Math.min(previousIndex, reviews.length - 1)].id);
  }
}

async function runBusy(buttons, operation) {
  buttons.forEach(button => { button.disabled = true; });
  detailError.textContent = "";
  try {
    await operation();
  } catch (error) {
    console.error(error);
    detailError.textContent = message(
      activeSection === "invitations"
        ? "invitationAcceptFailed"
        : "cancellationDeleteFailed"
    );
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

function currentReviews() {
  return activeSection === "invitations"
    ? invitationReviews
    : cancellationReviews;
}

function selectedIndex() {
  return currentReviews().findIndex(review => review.id === selectedId);
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
  return !timestamp || Number.isNaN(date.getTime())
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