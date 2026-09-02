import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const loggedErrors = [];
const resolutions = [];
const pendingTransfers = [];
const attendee = {
  id: "mailto:user@example.test",
  participationStatus: "ACCEPTED",
};
let previewCalendar = null;
let calendarObserver = null;
let transferredItem = null;
let storedCalendarItem = null;
let cleanupCount = 0;
const calendar = {
  id: "calendar-1",
  name: "Test calendar",
  wrappedJSObject: {
    mUncachedCalendar: {
      wrappedJSObject: { mItemInfoCache: {} },
    },
  },
  getProperty(name) {
    if (name === "calendar-main-default") {
      return true;
    }
    if (name === "imip.identity.key") {
      return "identity-1";
    }
    return name === "imip.identity" ? { email: "user@example.test" } : null;
  },
  async addItem(item) {
    item.calendar = this;
    transferredItem = item;
    storedCalendarItem = item;
    calendarObserver?.onAddItem(item);
    return item;
  },
  async getItem(itemId) {
    return storedCalendarItem?.id === itemId ? storedCalendarItem : null;
  },
  async modifyItem(item) {
    item.calendar = this;
    storedCalendarItem = item;
    return item;
  },
  async deleteItem() {
    storedCalendarItem = null;
  },
};
const secondaryCalendar = {
  id: "calendar-2",
  name: "Secondary",
  wrappedJSObject: {
    mUncachedCalendar: {
      wrappedJSObject: { mItemInfoCache: {} },
    },
  },
  getProperty(name) {
    if (name === "imip.identity.key") {
      return "identity-2";
    }
    return name === "imip.identity"
      ? { email: "user@secondary.example.test" }
      : null;
  },
};
let inheritedIdentityEmail = "user@secondary.example.test";
const inheritedIdentityCalendar = {
  id: "calendar-inherited",
  name: "Inherited default identity",
  wrappedJSObject: {
    mUncachedCalendar: {
      wrappedJSObject: { mItemInfoCache: {} },
    },
  },
  getProperty(name) {
    if (name === "imip.identity.key") {
      return null;
    }
    return name === "imip.identity" ? { email: inheritedIdentityEmail } : null;
  },
};
const localCalendar = {
  id: "calendar-3",
  name: "Local",
  getProperty() {
    throw new Error("calendar properties unavailable");
  },
  async getItem(itemId) {
    return itemId === "event-8" ? createItem(itemId) : null;
  },
};
const cachedCalendar = {
  id: "calendar-4",
  name: "Cached",
  wrappedJSObject: {
    mUncachedCalendar: {
      wrappedJSObject: { mItemInfoCache: {} },
    },
    mCachedCalendar: {
      async getItem(itemId) {
        return itemId === "event-9" ? createItem(itemId) : null;
      },
    },
  },
  getProperty() {
    return null;
  },
};
const userCalendars = [calendar];

let receivedItem = createItem("event-1");
const itipItem = {
  receivedMethod: "REQUEST",
  init() {},
  getItemList() {
    return [receivedItem];
  },
};

class ExtensionAPIPersistent {
  constructor(extension) {
    this.extension = extension;
  }
}

class EventManager {
  api() {
    return {};
  }
}

const cal = {
  manager: {
    getCalendars() {
      return previewCalendar
        ? [...userCalendars, previewCalendar]
        : [...userCalendars];
    },
    getCalendarById(id) {
      return (
        userCalendars.find(userCalendar => userCalendar.id === id) ||
        (previewCalendar?.id === id ? previewCalendar : null)
      );
    },
    createCalendar(type) {
      assert.equal(type, "memory");
      return createTestCalendar();
    },
    registerCalendar(registeredCalendar) {
      previewCalendar = registeredCalendar;
    },
    unregisterCalendar() {
      previewCalendar = null;
    },
    addCalendarObserver(observer) {
      calendarObserver = observer;
    },
    removeCalendarObserver() {},
  },
  acl: {
    isCalendarWritable() {
      return true;
    },
    userCanAddItemsToCalendar() {
      return true;
    },
  },
  itip: {
    getInvitedAttendee() {
      return attendee;
    },
    isOpenInvitation() {
      return true;
    },
    cleanupItipItem() {
      cleanupCount += 1;
    },
    compareSequence() {
      return 0;
    },
  },
};

const sandbox = {
  ChromeUtils: {
    generateQI() {
      return () => {};
    },
    importESModule(path) {
      if (path.endsWith("ExtensionCommon.sys.mjs")) {
        return { ExtensionCommon: { EventManager, ExtensionAPIPersistent } };
      }
      if (path.endsWith("calUtils.sys.mjs")) {
        return { cal };
      }
      return { MailServices: { accounts: { allIdentities: [] } } };
    },
  },
  Cc: {
    "@mozilla.org/calendar/itip-item;1": {
      createInstance() {
        return itipItem;
      },
    },
  },
  Ci: {
    calIItipItem: { NONE: 0 },
  },
  Services: {
    io: { newURI(value) { return value; } },
    obs: { notifyObservers() {} },
  },
  console: {
    ...console,
    error(...args) {
      loggedErrors.push(args);
    },
  },
  setTimeout,
  clearTimeout,
};

const source = await readFile(
  new URL("../api/invitationPreview/implementation.js", import.meta.url),
  "utf8"
);
vm.runInNewContext(source, sandbox);

const extensionApi = new sandbox.invitationPreview({ id: "invite-preview@example.test" });
extensionApi.PERSISTENT_EVENTS.onResolved.call(extensionApi, {
  fire: { async: async resolution => resolutions.push(resolution) },
});
extensionApi.PERSISTENT_EVENTS.onTransferPending.call(extensionApi, {
  fire: { async: async transfer => pendingTransfers.push(transfer) },
});
const api = extensionApi.getAPI({}).invitationPreview;
const result = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-1",
  preferredCalendarId: null,
});

assert.equal(result.status, "staged");
assert.equal(result.pending, true);
assert.equal(attendee.participationStatus, "NEEDS-ACTION");
assert.notEqual(result.calendarId, calendar.id);
assert.equal(previewCalendar.name, "Invite Preview");
assert.equal(previewCalendar.getProperty("color"), "#7d8790");
assert.equal(previewCalendar.getProperty("calendar-main-in-composite"), true);
assert.equal(previewCalendar.currentItem.getProperty("TRANSP"), "TRANSPARENT");
assert.equal(
  previewCalendar.currentItem.getProperty("X-INVITE-PREVIEW-OWNER"),
  "invite-preview@example.test"
);
assert.equal(previewCalendar.currentItem.getProperty("X-INVITE-PREVIEW-SOURCE"), "source-1");
assert.equal(
  previewCalendar.currentItem.getProperty("X-INVITE-PREVIEW-TARGET-CALENDAR"),
  calendar.id
);
assert.deepEqual(JSON.parse(JSON.stringify(await api.listCalendars())), [
  { id: calendar.id, name: calendar.name, isDefault: true },
]);
assert.equal(cleanupCount, 1, "staging always cleans up the parsed iTIP item");

attendee.participationStatus = "ACCEPTED";
const pendingItem = previewCalendar.currentItem;
const acceptedItem = pendingItem.clone();
calendarObserver.onModifyItem(acceptedItem, pendingItem);
await new Promise(resolve => setImmediate(resolve));
assert.equal(
  previewCalendar.currentItem,
  null,
  "resolved local event is removed after the target add succeeds"
);
assert.equal(transferredItem.calendar, calendar);
assert.equal(transferredItem.getProperty("X-INVITE-PREVIEW-OWNER"), null);
assert.equal(transferredItem.getProperty("X-INVITE-PREVIEW-SOURCE"), null);
assert.equal(
  transferredItem.getProperty("X-INVITE-PREVIEW-TARGET-CALENDAR"),
  null,
  "target event does not retain private preview metadata"
);
assert.equal(
  transferredItem.getProperty("TRANSP"),
  null,
  "target event restores the invitation's original transparency"
);
assert.deepEqual(JSON.parse(JSON.stringify(resolutions)), [
  {
    sourceId: "source-1",
    calendarId: calendar.id,
    itemId: "event-1",
    participationStatus: "ACCEPTED",
  },
]);

transferredItem = null;
receivedItem = createItem("event-2");
const retryResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-2",
  preferredCalendarId: null,
});
assert.equal(retryResult.status, "staged");
calendar.addItem = async () => {
  throw new Error("target write failed");
};
attendee.participationStatus = "ACCEPTED";
const retryPendingItem = previewCalendar.currentItem;
calendarObserver.onModifyItem(retryPendingItem.clone(), retryPendingItem);
await new Promise(resolve => setImmediate(resolve));
assert.equal(
  previewCalendar.currentItem.getProperty("X-INVITE-PREVIEW-OWNER"),
  "invite-preview@example.test"
);
assert.equal(
  previewCalendar.currentItem.getProperty("X-INVITE-PREVIEW-TARGET-CALENDAR"),
  calendar.id,
  "failed transfer retains its target for a later retry"
);
assert.equal(transferredItem, null);
assert.equal(loggedErrors.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(pendingTransfers)), [
  {
    sourceId: "source-2",
    calendarId: previewCalendar.id,
    itemId: "event-2",
    targetCalendarId: calendar.id,
    participationStatus: "ACCEPTED",
  },
]);

calendar.addItem = async item => {
  item.calendar = calendar;
  transferredItem = item;
  calendarObserver.onAddItem(item);
  return item;
};
assert.deepEqual(
  JSON.parse(
    JSON.stringify(
      await api.inspect([{ calendarId: previewCalendar.id, itemId: "event-2" }])
    )
  ),
  [],
  "inspection retries an accepted transfer without another response change"
);
assert.equal(transferredItem.id, "event-2");
assert.equal(resolutions.at(-1).sourceId, "source-2");

transferredItem = null;
receivedItem = createItem("event-3");
const declinedResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-3",
  preferredCalendarId: null,
});
assert.equal(declinedResult.status, "staged");
attendee.participationStatus = "DECLINED";
const declinedItem = previewCalendar.currentItem;
calendarObserver.onModifyItem(declinedItem.clone(), declinedItem);
await new Promise(resolve => setImmediate(resolve));
assert.equal(previewCalendar.currentItem, null);
assert.equal(transferredItem, null, "declined invitations are not added to the target");
assert.equal(resolutions.at(-1).participationStatus, "DECLINED");

receivedItem = createItem("event-4");
const resumedResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-4",
  preferredCalendarId: null,
  targetCalendarId: calendar.id,
  participationStatus: "TENTATIVE",
});
assert.equal(resumedResult.status, "alreadyProcessed");
assert.equal(resumedResult.pending, false);
assert.equal(transferredItem.id, "event-4");
assert.equal(attendee.participationStatus, "TENTATIVE");
assert.equal(resolutions.at(-1).participationStatus, "TENTATIVE");

receivedItem = createItem("event-5");
const pendingCancellationResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-5",
  preferredCalendarId: null,
});
assert.equal(pendingCancellationResult.status, "staged");
itipItem.receivedMethod = "CANCEL";
userCalendars.length = 0;
const cancellationResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-5-cancel",
  preferredCalendarId: null,
});
assert.equal(cancellationResult.status, "cancelled");
assert.equal(previewCalendar.currentItem, null);
assert.equal(cleanupCount, 6, "every staging outcome cleans up its iTIP item");

userCalendars.push(inheritedIdentityCalendar, calendar, secondaryCalendar);
itipItem.receivedMethod = "REQUEST";
attendee.id = "mailto:user@secondary.example.test";
attendee.participationStatus = "ACCEPTED";
receivedItem = createItem("event-6");
receivedItem.setProperty("X-MOZ-INVITED-ATTENDEE", "mailto:user@example.test");
const mappedResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-6",
  preferredCalendarId: calendar.id,
});
assert.equal(mappedResult.status, "staged");
assert.equal(
  previewCalendar.currentItem.getProperty("X-INVITE-PREVIEW-TARGET-CALENDAR"),
  secondaryCalendar.id,
  "an explicit email mapping takes precedence over inherited identity and fallback"
);

itipItem.receivedMethod = "CANCEL";
await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-6-cancel",
  preferredCalendarId: null,
});
itipItem.receivedMethod = "REQUEST";
inheritedIdentityEmail = "user@inherited.example.test";
attendee.id = "mailto:user@inherited.example.test";
receivedItem = createItem("event-inherited");
const inheritedMappingResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-inherited",
  preferredCalendarId: calendar.id,
});
assert.equal(inheritedMappingResult.status, "staged");
assert.equal(
  previewCalendar.currentItem.getProperty("X-INVITE-PREVIEW-TARGET-CALENDAR"),
  inheritedIdentityCalendar.id,
  "an inherited identity remains a valid mapping when no explicit mapping matches"
);

itipItem.receivedMethod = "CANCEL";
await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-inherited-cancel",
  preferredCalendarId: null,
});
itipItem.receivedMethod = "REQUEST";
attendee.id = "mailto:user@secondary.example.test";
receivedItem = createItem("event-7");
secondaryCalendar.wrappedJSObject.mUncachedCalendar.wrappedJSObject
  .mItemInfoCache[receivedItem.id] = {};
const duplicateResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-7",
  preferredCalendarId: calendar.id,
});
assert.equal(duplicateResult.status, "alreadyProcessed");
assert.equal(duplicateResult.calendarId, secondaryCalendar.id);
assert.equal(previewCalendar.currentItem, null, "an existing UID is not staged again");

userCalendars.push(localCalendar);
receivedItem = createItem("event-8");
const localDuplicateResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-8",
  preferredCalendarId: calendar.id,
});
assert.equal(localDuplicateResult.status, "alreadyProcessed");
assert.equal(localDuplicateResult.calendarId, localCalendar.id);
assert.equal(previewCalendar.currentItem, null);

userCalendars.push(cachedCalendar);
receivedItem = createItem("event-9");
const coldIndexDuplicateResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-9",
  preferredCalendarId: calendar.id,
});
assert.equal(coldIndexDuplicateResult.status, "alreadyProcessed");
assert.equal(coldIndexDuplicateResult.calendarId, cachedCalendar.id);
assert.equal(previewCalendar.currentItem, null);

receivedItem = createItem("event-10");
const stalePreviewResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-10",
  preferredCalendarId: calendar.id,
});
assert.equal(stalePreviewResult.status, "staged");
secondaryCalendar.wrappedJSObject.mUncachedCalendar.wrappedJSObject
  .mItemInfoCache[receivedItem.id] = {};
const inspectedReferences = await api.inspect([
  { calendarId: previewCalendar.id, itemId: receivedItem.id },
]);
assert.deepEqual(JSON.parse(JSON.stringify(inspectedReferences)), []);
assert.equal(
  previewCalendar.currentItem,
  null,
  "reconciliation removes a preview whose UID exists in a real calendar"
);

receivedItem = createItem("event-11");
const remapResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-11",
  preferredCalendarId: calendar.id,
});
assert.equal(remapResult.status, "staged");
previewCalendar.currentItem.setProperty(
  "X-INVITE-PREVIEW-TARGET-CALENDAR",
  calendar.id
);
previewCalendar.currentItem.setProperty(
  "X-MOZ-INVITED-ATTENDEE",
  "mailto:user@example.test"
);
const remapReference = {
  calendarId: previewCalendar.id,
  itemId: receivedItem.id,
  preferredCalendarId: calendar.id,
};
assert.deepEqual(
  JSON.parse(JSON.stringify(await api.inspect([remapReference]))),
  [remapReference]
);
assert.equal(
  previewCalendar.currentItem.getProperty("X-INVITE-PREVIEW-TARGET-CALENDAR"),
  secondaryCalendar.id,
  "reconciliation corrects the target of an existing pending preview"
);
assert.equal(
  previewCalendar.currentItem.getProperty("X-MOZ-INVITED-ATTENDEE"),
  attendee.id
);

userCalendars.length = 0;
userCalendars.push(calendar);
attendee.id = "mailto:user@example.test";
receivedItem = createItem("event-cancel-review");
receivedItem.calendar = calendar;
storedCalendarItem = receivedItem;
itipItem.receivedMethod = "CANCEL";
const cancellationReviewResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-cancel-review",
  preferredCalendarId: null,
});
assert.equal(cancellationReviewResult.status, "cancellationPending");
assert.equal(cancellationReviewResult.cancellations.length, 1);
assert.deepEqual(
  JSON.parse(JSON.stringify(cancellationReviewResult.cancellations[0])),
  {
    calendarId: calendar.id,
    itemId: receivedItem.id,
    calendarName: calendar.name,
    title: "Synthetic event",
    startDate: "2026-09-03T09:00:00.000Z",
    endDate: "2026-09-03T10:00:00.000Z",
    allDay: false,
    organizer: "Synthetic Organizer",
    recurrenceId: null,
  }
);
assert.equal(storedCalendarItem.id, receivedItem.id, "review creation never deletes an event");

const deletionResult = await api.deleteCancellation(
  "BEGIN:VCALENDAR",
  calendar.id,
  receivedItem.id,
  null
);
assert.equal(deletionResult.status, "deleted");
assert.equal(storedCalendarItem, null);

receivedItem = createItem("event-cancel-mismatch");
receivedItem.organizer = {
  id: "mailto:different-organizer@example.test",
  commonName: "Different Organizer",
};
storedCalendarItem = createItem(receivedItem.id);
const mismatchResult = await api.deleteCancellation(
  "BEGIN:VCALENDAR",
  calendar.id,
  receivedItem.id,
  null
);
assert.equal(mismatchResult.status, "mismatch");
assert.equal(storedCalendarItem.id, receivedItem.id);

const recurrenceId = {
  icalString: "20260910T090000Z",
  compare(other) {
    return this.icalString.localeCompare(other.icalString);
  },
};
const occurrence = createItem("event-series");
occurrence.recurrenceId = recurrenceId;
receivedItem = createItem("event-series");
receivedItem.recurrenceId = recurrenceId;
const seriesItem = createItem("event-series");
seriesItem.calendar = calendar;
seriesItem.recurrenceInfo = {
  getOccurrenceFor(requestedId) {
    return requestedId.icalString === recurrenceId.icalString ? occurrence : null;
  },
};
let removedOccurrence = null;
seriesItem.clone = () => {
  const clone = createItem(seriesItem.id);
  clone.calendar = calendar;
  clone.recurrenceInfo = {
    getOccurrenceFor: seriesItem.recurrenceInfo.getOccurrenceFor,
    removeOccurrenceAt(requestedId) {
      removedOccurrence = requestedId.icalString;
    },
  };
  return clone;
};
storedCalendarItem = seriesItem;
const occurrenceReview = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-cancel-occurrence",
  preferredCalendarId: null,
});
assert.equal(occurrenceReview.status, "cancellationPending");
assert.equal(occurrenceReview.cancellations[0].recurrenceId, recurrenceId.icalString);
const occurrenceDeletion = await api.deleteCancellation(
  "BEGIN:VCALENDAR",
  calendar.id,
  seriesItem.id,
  recurrenceId.icalString
);
assert.equal(occurrenceDeletion.status, "deleted");
assert.equal(removedOccurrence, recurrenceId.icalString);
assert.equal(storedCalendarItem.id, seriesItem.id, "the recurring parent remains stored");

receivedItem = createItem("event-series-without-recurrence-data");
receivedItem.recurrenceId = recurrenceId;
storedCalendarItem = createItem(receivedItem.id);
storedCalendarItem.calendar = calendar;
const unsafeOccurrenceDeletion = await api.deleteCancellation(
  "BEGIN:VCALENDAR",
  calendar.id,
  storedCalendarItem.id,
  recurrenceId.icalString
);
assert.equal(unsafeOccurrenceDeletion.status, "mismatch");
assert.equal(
  storedCalendarItem.id,
  receivedItem.id,
  "an occurrence cancellation never deletes a master without recurrence data"
);

extensionApi.onShutdown(false);

function createTestCalendar() {
  const calendarProperties = new Map();
  return {
    id: null,
    name: "",
    type: "memory",
    currentItem: null,
    getProperty(name) {
      return calendarProperties.get(name) ?? null;
    },
    setProperty(name, value) {
      calendarProperties.set(name, value);
    },
    async getItem(itemId) {
      return this.currentItem?.id === itemId ? this.currentItem : null;
    },
    async addItem(newItem) {
      newItem.calendar = this;
      this.currentItem = newItem;
      return newItem;
    },
    async modifyItem(newItem, oldItem) {
      this.currentItem = newItem;
      calendarObserver?.onModifyItem(newItem, oldItem);
      return newItem;
    },
    async deleteItem(item) {
      this.currentItem = null;
      calendarObserver?.onDeleteItem(item);
    },
  };
}

function createItem(id, initialProperties = new Map()) {
  const properties = new Map(initialProperties);
  const item = {
    id,
    title: "Synthetic event",
    calendar: null,
    organizer: {
      id: "mailto:organizer@example.test",
      commonName: "Synthetic Organizer",
    },
    startDate: {
      isDate: false,
      jsDate: new Date("2026-09-03T09:00:00.000Z"),
    },
    endDate: {
      jsDate: new Date("2026-09-03T10:00:00.000Z"),
    },
    recurrenceId: null,
    recurrenceInfo: null,
    stampTime: "stamp",
    lastModifiedTime: "modified",
    getProperty(name) {
      return properties.get(name) ?? null;
    },
    setProperty(name, value) {
      properties.set(name, value);
    },
    deleteProperty(name) {
      properties.delete(name);
    },
    getAttendees() {
      return [attendee];
    },
    clone() {
      const clone = createItem(id, properties);
      clone.calendar = this.calendar;
      return clone;
    },
  };
  item.parentItem = item;
  return item;
}