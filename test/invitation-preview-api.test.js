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
    return name === "calendar-main-default" ? true : null;
  },
  async addItem(item) {
    item.calendar = this;
    transferredItem = item;
    calendarObserver?.onAddItem(item);
    return item;
  },
};

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
      return previewCalendar ? [calendar, previewCalendar] : [calendar];
    },
    getCalendarById(id) {
      return id === calendar.id ? calendar : previewCalendar?.id === id ? previewCalendar : null;
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

const extensionApi = new sandbox.invitationPreview({ id: "invite-preview@test" });
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
  "invite-preview@test"
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
assert.equal(previewCalendar.currentItem.getProperty("X-INVITE-PREVIEW-OWNER"), "invite-preview@test");
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
cal.manager.getCalendars = () => [previewCalendar];
const cancellationResult = await api.stage("BEGIN:VCALENDAR", {
  sourceId: "source-5-cancel",
  preferredCalendarId: null,
});
assert.equal(cancellationResult.status, "cancelled");
assert.equal(previewCalendar.currentItem, null);
assert.equal(cleanupCount, 6, "every staging outcome cleans up its iTIP item");

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
    async getItem() {
      return this.currentItem;
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
    calendar: null,
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
    clone() {
      const clone = createItem(id, properties);
      clone.calendar = this.calendar;
      return clone;
    },
  };
  item.parentItem = item;
  return item;
}