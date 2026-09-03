{
  const {
    ExtensionCommon: { EventManager, ExtensionAPIPersistent },
  } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
  const { cal } = ChromeUtils.importESModule(
    "resource:///modules/calendar/calUtils.sys.mjs"
  );
  const { MailServices } = ChromeUtils.importESModule(
    "resource:///modules/MailServices.sys.mjs"
  );
  const { CalItipMessageSender } = ChromeUtils.importESModule(
    "resource:///modules/CalItipMessageSender.sys.mjs"
  );
  const { NotificationSounds } = ChromeUtils.importESModule(
    "resource:///modules/NotificationSounds.sys.mjs"
  );

  const OWNER_PROPERTY = "X-INVITE-PREVIEW-OWNER";
  const SOURCE_PROPERTY = "X-INVITE-PREVIEW-SOURCE";
  const ORIGINAL_TRANSP_PROPERTY = "X-INVITE-PREVIEW-ORIGINAL-TRANSP";
  const TARGET_CALENDAR_PROPERTY = "X-INVITE-PREVIEW-TARGET-CALENDAR";
  const DEFAULT_TRANSP = "__DEFAULT__";
  const PREVIEW_CALENDAR_ID = "8d2a1473-4f7b-47db-9c71-3e1096609cd1";
  const PREVIEW_CALENDAR_NAME = "Invite Preview";
  const PREVIEW_CALENDAR_COLOR = "#7d8790";
  const ITEM_LOOKUP_TIMEOUT_MS = 1000;
  const TRANSFER_TIMEOUT_MS = 30000;

  this.invitationPreview = class extends ExtensionAPIPersistent {
    PERSISTENT_EVENTS = {
      onResolved({ fire }) {
        const registration = { fire };
        this.eventFires.add(registration);
        return {
          unregister: () => this.eventFires.delete(registration),
          convert(newFire) {
            registration.fire = newFire;
          },
        };
      },
      onTransferPending({ fire }) {
        const registration = { fire };
        this.transferFires.add(registration);
        return {
          unregister: () => this.transferFires.delete(registration),
          convert(newFire) {
            registration.fire = newFire;
          },
        };
      },
    };

    constructor(extension) {
      super(extension);
      this.eventFires = new Set();
      this.transferFires = new Set();
      this.cleaningItems = new Set();
      this.transferringItems = new Set();
      this.calendarObserver = null;
    }

    onStartup() {
      this.startObserver();
    }

    onShutdown(isAppShutdown) {
      if (this.calendarObserver) {
        cal.manager.removeCalendarObserver(this.calendarObserver);
        this.calendarObserver = null;
      }
      this.eventFires.clear();
      this.transferFires.clear();
      if (!isAppShutdown) {
        const previewCalendar = cal.manager.getCalendarById(PREVIEW_CALENDAR_ID);
        if (previewCalendar) {
          cal.manager.unregisterCalendar(previewCalendar);
        }
        Services.obs.notifyObservers(null, "startupcache-invalidate", null);
      }
    }

    startObserver() {
      if (this.calendarObserver) {
        return;
      }

      this.calendarObserver = {
        QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
        onStartBatch() {},
        onEndBatch() {},
        onLoad() {},
        onAddItem: item => {
          void this.handleAddedItem(item);
        },
        onError() {},
        onPropertyChanged() {},
        onPropertyDeleting() {},
        onModifyItem: (newItem, oldItem) => {
          void this.handleModifiedItem(newItem, oldItem);
        },
        onDeleteItem: item => {
          const key = `${item?.calendar?.id}\n${item?.id}`;
          if (this.isOwnedPreview(item) && !this.cleaningItems.has(key)) {
            this.emitResolution(item, "REMOVED");
          }
        },
      };
      cal.manager.addCalendarObserver(this.calendarObserver);
    }

    isOwnedPreview(item) {
      return item?.getProperty(OWNER_PROPERTY) === this.extension.id;
    }

    async handleModifiedItem(newItem, oldItem) {
      const sourceItem = this.isOwnedPreview(oldItem)
        ? oldItem
        : this.isOwnedPreview(newItem)
          ? newItem
          : null;
      if (!sourceItem) {
        return;
      }

      const status = participationStatus(newItem);
      if (!status || status === "NEEDS-ACTION") {
        return;
      }

      const key = `${newItem.calendar.id}\n${newItem.id}`;
      if (this.cleaningItems.has(key)) {
        return;
      }
      await this.finalizeResolvedItem(newItem, sourceItem, status);
    }

    async finalizeResolvedItem(resolvedItem, sourceItem, status, sendReply = false) {
      const key = `${resolvedItem.calendar.id}\n${resolvedItem.id}`;
      if (this.cleaningItems.has(key)) {
        return false;
      }
      this.cleaningItems.add(key);
      try {
        await this.transferResolvedItem(resolvedItem, sourceItem, status, sendReply);
        return true;
      } catch (error) {
        console.error("Invite Preview could not move a resolved invitation", error);
        await preserveTransferMetadata(resolvedItem, sourceItem).catch(metadataError => {
          console.error("Invite Preview could not preserve a pending transfer", metadataError);
        });
        this.emitTransferPending(resolvedItem, status, sourceItem);
        return false;
      } finally {
        this.cleaningItems.delete(key);
      }
    }

    async transferResolvedItem(resolvedItem, sourceItem, status, sendReply = false) {
      if (status === "DECLINED") {
        await resolvedItem.calendar.deleteItem(resolvedItem);
        this.emitResolution(resolvedItem, status, sourceItem);
        return;
      }

      const targetCalendarId = sourceItem.getProperty(TARGET_CALENDAR_PROPERTY);
      const targetCalendar = cal.manager.getCalendarById(targetCalendarId);
      if (!targetCalendar || targetCalendar.id === PREVIEW_CALENDAR_ID) {
        throw new Error("Invitation target calendar is unavailable");
      }

      const targetItem = resolvedItem.clone();
      copyPreviewMetadata(targetItem, sourceItem);
      restoreTransparency(targetItem);
      targetItem.deleteProperty(TARGET_CALENDAR_PROPERTY);
      targetItem.calendar = targetCalendar;
      const originalTargetItem = sourceItem.clone();
      copyPreviewMetadata(originalTargetItem, sourceItem);
      restoreTransparency(originalTargetItem);
      originalTargetItem.deleteProperty(TARGET_CALENDAR_PROPERTY);
      originalTargetItem.calendar = targetCalendar;

      const transferKey = `${targetCalendar.id}\n${targetItem.id}`;
      this.transferringItems.add(transferKey);
      try {
        if (!calendarHasIndexedItem(targetCalendar, targetItem.id)) {
          try {
            await withTimeout(
              targetCalendar.addItem(targetItem),
              TRANSFER_TIMEOUT_MS,
              "Target calendar operation timed out"
            );
          } catch (error) {
            if (!calendarHasIndexedItem(targetCalendar, targetItem.id)) {
              throw error;
            }
          }
        }

        if (sendReply) {
          try {
            sendInvitationReply(originalTargetItem, targetItem);
          } catch (error) {
            console.error("Invite Preview could not send the invitation reply", error);
          }
        }
        await resolvedItem.calendar.deleteItem(resolvedItem);
        this.emitResolution(targetItem, status, sourceItem);
      } finally {
        this.transferringItems.delete(transferKey);
      }
    }

    async handleAddedItem(item) {
      if (!item || item.calendar.id === PREVIEW_CALENDAR_ID) {
        return;
      }
      const transferKey = `${item.calendar.id}\n${item.id}`;
      if (this.transferringItems.has(transferKey)) {
        return;
      }
      const previewCalendar = cal.manager.getCalendarById(PREVIEW_CALENDAR_ID);
      const previewItem = await previewCalendar?.getItem(item.id);
      if (
        !previewItem ||
        previewItem.getProperty(TARGET_CALENDAR_PROPERTY) !== item.calendar.id
      ) {
        return;
      }
      const status = participationStatus(previewItem);
      if (status && status !== "NEEDS-ACTION") {
        await previewCalendar.deleteItem(previewItem);
      }
    }

    emitResolution(item, status, sourceItem = item) {
      const resolution = {
        sourceId: sourceItem.getProperty(SOURCE_PROPERTY) || "",
        calendarId: item.calendar.id,
        itemId: item.id,
        participationStatus: status,
      };
      for (const registration of this.eventFires) {
        void registration.fire.async(resolution).catch(() => {});
      }
    }

    emitTransferPending(item, status, sourceItem = item) {
      const transfer = {
        sourceId: sourceItem.getProperty(SOURCE_PROPERTY) || "",
        calendarId: item.calendar.id,
        itemId: item.id,
        targetCalendarId: sourceItem.getProperty(TARGET_CALENDAR_PROPERTY) || "",
        participationStatus: status,
      };
      for (const registration of this.transferFires) {
        void registration.fire.async(transfer).catch(() => {});
      }
    }

    getAPI(context) {
      this.startObserver();
      return {
        invitationPreview: {
          listCalendars: async () =>
            writableCalendars()
              .filter(calendar => calendar.id !== PREVIEW_CALENDAR_ID)
              .map(calendar => ({
              id: calendar.id,
              name: calendar.name,
              isDefault: Boolean(calendar.getProperty("calendar-main-default")),
              })),

          stage: async (icalText, details) => {
            try {
              const outcome = await stageInvitation(
                icalText,
                details,
                this.extension.id,
                this.extension.localeData?.localizeMessage("extensionName") ||
                  PREVIEW_CALENDAR_NAME
              );
              if (!details.participationStatus || !outcome.pending) {
                return outcome;
              }

              const previewCalendar = cal.manager.getCalendarById(outcome.calendarId);
              const previewItem = await previewCalendar?.getItem(outcome.itemId);
              if (!previewItem) {
                return result("calendarError");
              }
              const transferred = await this.finalizeResolvedItem(
                previewItem,
                previewItem,
                details.participationStatus
              );
              return transferred
                ? result(
                  "alreadyProcessed",
                  false,
                  details.targetCalendarId,
                  previewItem.id
                )
                : result("calendarError", true, previewCalendar.id, previewItem.id);
            } catch (error) {
              console.error("Invite Preview could not stage a calendar invitation", error);
              return result("calendarError");
            }
          },

          inspect: async references => {
            const pending = [];
            const calendars = userCalendars();
            for (const reference of references) {
              const calendar = cal.manager.getCalendarById(reference.calendarId);
              const item = await calendar?.getItem(reference.itemId);
              if (!item || !this.isOwnedPreview(item)) {
                continue;
              }
              if (await findCalendarWithItem(calendars, item.id)) {
                await calendar.deleteItem(item);
                continue;
              }
              const status = participationStatus(item);
              if (
                status &&
                status !== "NEEDS-ACTION" &&
                (await this.finalizeResolvedItem(item, item, status))
              ) {
                continue;
              }
              if (!status || status === "NEEDS-ACTION") {
                await alignPendingPreviewTarget(
                  item,
                  reference.preferredCalendarId,
                  calendars
                );
              }
              pending.push(reference);
            }
            return pending;
          },

          acceptPreview: async (calendarId, itemId) => {
            try {
              if (calendarId !== PREVIEW_CALENDAR_ID) {
                return { status: "mismatch" };
              }
              const calendar = cal.manager.getCalendarById(calendarId);
              const item = await calendar?.getItem(itemId);
              if (!item) {
                return { status: "missing" };
              }
              if (!this.isOwnedPreview(item)) {
                return { status: "mismatch" };
              }
              const currentStatus = participationStatus(item);
              if (currentStatus === "ACCEPTED") {
                const transferred = await this.finalizeResolvedItem(
                  item,
                  item,
                  "ACCEPTED"
                );
                return { status: transferred ? "accepted" : "calendarError" };
              }
              if (currentStatus !== "NEEDS-ACTION") {
                return { status: "mismatch" };
              }
              const acceptedItem = item.clone();
              const invitedAttendee = cal.itip.getInvitedAttendee(
                acceptedItem,
                acceptedItem.calendar
              );
              if (!invitedAttendee) {
                return { status: "mismatch" };
              }
              invitedAttendee.participationStatus = "ACCEPTED";
              const accepted = await this.finalizeResolvedItem(
                acceptedItem,
                item,
                "ACCEPTED",
                true
              );
              return { status: accepted ? "accepted" : "calendarError" };
            } catch (error) {
              console.error("Invite Preview could not accept an invitation", error);
              return { status: "calendarError" };
            }
          },

          playReminderSound: async () => {
            try {
              if (!Services.prefs.getBoolPref("calendar.alarms.playsound", true)) {
                return false;
              }
              const soundURL =
                Services.prefs.getIntPref("calendar.alarms.soundType", 0) === 0
                  ? "chrome://calendar/content/sound.wav"
                  : Services.prefs.getStringPref("calendar.alarms.soundURL", "");
              if (!soundURL) {
                return false;
              }
              NotificationSounds.playCustomSound(soundURL);
              return true;
            } catch (error) {
              console.error("Invite Preview could not play the reminder sound", error);
              return false;
            }
          },

          deleteCancellation: async (icalText, calendarId, itemId, recurrenceId) => {
            try {
              return await deleteCancellation(
                icalText,
                calendarId,
                itemId,
                recurrenceId
              );
            } catch (error) {
              console.error("Invite Preview could not delete a cancelled event", error);
              return { status: "calendarError" };
            }
          },

          remove: async (calendarId, itemId) => {
            const calendar = cal.manager.getCalendarById(calendarId);
            const item = await calendar?.getItem(itemId);
            if (!item || !this.isOwnedPreview(item)) {
              return false;
            }
            await calendar.deleteItem(item);
            return true;
          },

          onResolved: new EventManager({
            context,
            module: "invitationPreview",
            event: "onResolved",
            extensionApi: this,
          }).api(),
          onTransferPending: new EventManager({
            context,
            module: "invitationPreview",
            event: "onTransferPending",
            extensionApi: this,
          }).api(),
        },
      };
    }
  };

  async function stageInvitation(icalText, details, extensionId, previewCalendarName) {
    const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(
      Ci.calIItipItem
    );
    itipItem.init(icalText);

    try {
      return await stageItipItem(itipItem, details, extensionId, previewCalendarName);
    } finally {
      cal.itip.cleanupItipItem(itipItem);
    }
  }

  async function stageItipItem(itipItem, details, extensionId, previewCalendarName) {
    const method = String(itipItem.receivedMethod || "").toUpperCase();
    if (method !== "REQUEST" && method !== "CANCEL") {
      return result("ignored");
    }

    itipItem.receivedMethod = method;
    itipItem.responseMethod = method === "REQUEST" ? "REPLY" : method;
    itipItem.autoResponse = Ci.calIItipItem.NONE;
    itipItem.isSend = false;

    const items = itipItem.getItemList();
    if (items.length === 0) {
      return result("ignored");
    }

    const previewCalendar = ensurePreviewCalendar(previewCalendarName);
    const calendars = userCalendars();

    if (method === "CANCEL") {
      const existing = await previewCalendar.getItem(items[0].id);
      if (isPreview(existing, extensionId)) {
        const cancelled = await applyPendingCancellation(
          previewCalendar,
          existing,
          items
        );
        return cancelled
          ? result("cancelled", false, previewCalendar.id, existing.id)
          : result("alreadyProcessed");
      }

      const cancellations = await cancellationCandidates(items, calendars);
      return cancellations.length > 0
        ? { ...result("cancellationPending"), cancellations }
        : result("alreadyProcessed");
    }

    const existingPreview = await previewCalendar.getItem(items[0].id);
    const existingCalendar = await findCalendarWithItem(calendars, items[0].id);
    if (existingCalendar) {
      if (isPreview(existingPreview, extensionId)) {
        await previewCalendar.deleteItem(existingPreview);
      }
      return result("alreadyProcessed", false, existingCalendar.id, items[0].id);
    }

    const targetCalendar = selectTargetCalendar(
      items,
      details.preferredCalendarId,
      details.targetCalendarId,
      calendars
    );
    if (!targetCalendar) {
      return result("noCalendar");
    }

    const invitedAttendees = items.map(item =>
      findInvitedAttendee(item, targetCalendar)
    );
    if (invitedAttendees.some(attendee => !attendee)) {
      return result("noCalendar");
    }
    for (const [index, item] of items.entries()) {
      const invitedAttendee = invitedAttendees[index];
      invitedAttendee.participationStatus =
        details.participationStatus || "NEEDS-ACTION";
      item.setProperty("X-MOZ-INVITED-ATTENDEE", invitedAttendee.id);
      markPending(item, extensionId, details.sourceId, targetCalendar.id);
    }

    const existing = existingPreview;
    const existingIsPreview = isPreview(existing, extensionId);
    if (existing && !existingIsPreview && !cal.itip.isOpenInvitation(existing)) {
      return result("alreadyProcessed", false, existing.calendar.id, existing.id);
    }
    if (existingIsPreview && cal.itip.compare(items[0], existing) <= 0) {
      return result(
        "alreadyPending",
        true,
        existing.calendar.id,
        existing.id,
        targetCalendar
      );
    }

    const previewItem = items[0].parentItem.clone();
    previewItem.calendar = previewCalendar;
    const storedItem = existingIsPreview
      ? await previewCalendar.modifyItem(previewItem, existing)
      : await previewCalendar.addItem(previewItem);
    return result(
      existingIsPreview ? "updated" : "staged",
      true,
      previewCalendar.id,
      storedItem.id,
      targetCalendar
    );
  }

  function sendInvitationReply(originalItem, acceptedItem) {
    const invitedAttendee = cal.itip.getInvitedAttendee(
      acceptedItem,
      acceptedItem.calendar
    );
    if (!invitedAttendee) {
      return false;
    }
    const sender = new CalItipMessageSender(originalItem, invitedAttendee);
    sender.buildOutgoingMessages(
      Ci.calIOperationListener.ADD,
      acceptedItem,
      { responseMode: Ci.calIItipItem.AUTO }
    );
    return sender.send(acceptedItem.calendar.getProperty("itip.transport"));
  }

  function writableCalendars() {
    return userCalendars()
      .filter(calendar => {
        try {
          return (
            cal.acl.isCalendarWritable(calendar) &&
            cal.acl.userCanAddItemsToCalendar(calendar) &&
            calendar.getProperty("capabilities.events.supported") !== false
          );
        } catch {
          return false;
        }
      })
      .sort(compareCalendars);
  }

  function userCalendars() {
    return cal.manager
      .getCalendars()
      .filter(calendar => calendar.id !== PREVIEW_CALENDAR_ID);
  }

  function selectTargetCalendar(
    items,
    preferredCalendarId,
    targetCalendarId,
    availableCalendars = userCalendars()
  ) {
    const availableIds = new Set(availableCalendars.map(calendar => calendar.id));
    const calendars = writableCalendars().filter(calendar => availableIds.has(calendar.id));
    if (targetCalendarId) {
      return calendars.find(calendar => calendar.id === targetCalendarId);
    }

    const matchingCalendars = calendars.filter(calendar =>
      items.some(item => findCalendarAttendee(item, calendar))
    );
    const explicitlyMappedCalendars = matchingCalendars.filter(
      hasExplicitCalendarIdentity
    );
    const identityMatches = explicitlyMappedCalendars.length
      ? explicitlyMappedCalendars
      : matchingCalendars;
    return (
      identityMatches.find(calendar => calendar.id === preferredCalendarId) ||
      identityMatches[0] ||
      calendars.find(calendar => calendar.id === preferredCalendarId) ||
      calendars.find(calendar =>
        Boolean(calendar.getProperty("calendar-main-default"))
      )
    );
  }

  async function alignPendingPreviewTarget(item, preferredCalendarId, calendars) {
    const targetCalendar = selectTargetCalendar(
      [item],
      preferredCalendarId,
      null,
      calendars
    );
    if (!targetCalendar) {
      return;
    }
    const invitedAttendee = findInvitedAttendee(item, targetCalendar);
    if (!invitedAttendee) {
      return;
    }
    if (
      item.getProperty(TARGET_CALENDAR_PROPERTY) === targetCalendar.id &&
      normalizeEmail(item.getProperty("X-MOZ-INVITED-ATTENDEE")) ===
        normalizeEmail(invitedAttendee.id)
    ) {
      return;
    }

    const updatedItem = item.clone();
    const stampTime = updatedItem.stampTime;
    const lastModifiedTime = updatedItem.lastModifiedTime;
    updatedItem.setProperty(TARGET_CALENDAR_PROPERTY, targetCalendar.id);
    updatedItem.setProperty("X-MOZ-INVITED-ATTENDEE", invitedAttendee.id);
    restoreRevisionTimes(updatedItem, stampTime, lastModifiedTime);
    await item.calendar.modifyItem(updatedItem, item);
  }

  function hasExplicitCalendarIdentity(calendar) {
    try {
      return Boolean(calendar.getProperty("imip.identity.key"));
    } catch {
      return false;
    }
  }

  function ensurePreviewCalendar(name) {
    let calendar = cal.manager.getCalendarById(PREVIEW_CALENDAR_ID);
    if (!calendar) {
      calendar = cal.manager.createCalendar(
        "memory",
        Services.io.newURI("moz-memory-calendar://")
      );
      calendar.id = PREVIEW_CALENDAR_ID;
      calendar.name = name;
      calendar.setProperty("color", PREVIEW_CALENDAR_COLOR);
      calendar.setProperty("calendar-main-in-composite", true);
      cal.manager.registerCalendar(calendar);
      calendar = cal.manager.getCalendarById(PREVIEW_CALENDAR_ID) || calendar;
    }
    calendar.name = name;
    calendar.setProperty("color", PREVIEW_CALENDAR_COLOR);
    calendar.setProperty("disabled", false);
    calendar.setProperty("calendar-main-in-composite", true);
    return calendar;
  }

  async function findCalendarWithItem(calendars, itemId) {
    const indexedCalendar = calendars.find(calendar =>
      calendarHasIndexedItem(calendar, itemId)
    );
    if (indexedCalendar) {
      return indexedCalendar;
    }

    const items = await Promise.all(
      calendars.map(calendar =>
        withTimeout(
          Promise.resolve().then(() => localCalendarCache(calendar).getItem(itemId)),
          ITEM_LOOKUP_TIMEOUT_MS,
          "Calendar lookup timed out"
        ).catch(() => null)
      )
    );
    const index = items.findIndex(Boolean);
    return index === -1 ? null : calendars[index];
  }

  async function cancellationCandidates(cancellationItems, calendars) {
    const foundItems = await findItemsInCalendars(calendars, cancellationItems[0].id);
    const candidates = [];
    for (const cancellationItem of cancellationItems) {
      for (const { calendar, item } of foundItems) {
        const targetItem = cancellationTarget(item, cancellationItem.recurrenceId);
        if (targetItem && cancellationMatches(cancellationItem, targetItem)) {
          candidates.push(cancellationCandidate(calendar, item, targetItem, cancellationItem));
        }
      }
    }
    return candidates;
  }

  async function findItemsInCalendars(calendars, itemId) {
    const items = await Promise.all(
      calendars.map(calendar =>
        withTimeout(
          Promise.resolve().then(() => localCalendarCache(calendar).getItem(itemId)),
          ITEM_LOOKUP_TIMEOUT_MS,
          "Calendar lookup timed out"
        ).catch(() => null)
      )
    );
    return items.flatMap((item, index) =>
      item ? [{ calendar: calendars[index], item }] : []
    );
  }

  function cancellationTarget(item, recurrenceId) {
    if (!recurrenceId) {
      return item;
    }
    if (item.recurrenceInfo) {
      return item.recurrenceInfo.getOccurrenceFor(recurrenceId);
    }
    return item.recurrenceId?.compare(recurrenceId) === 0 ? item : null;
  }

  function cancellationMatches(cancellationItem, targetItem) {
    try {
      return (
        normalizeEmail(cancellationItem.organizer?.id) !== "" &&
        normalizeEmail(cancellationItem.organizer?.id) ===
          normalizeEmail(targetItem.organizer?.id) &&
        cal.itip.compareSequence(cancellationItem, targetItem) >= 0
      );
    } catch {
      return false;
    }
  }

  async function applyPendingCancellation(calendar, item, cancellationItems) {
    const fullCancellation = cancellationItems.find(
      cancellationItem =>
        !cancellationItem.recurrenceId && cancellationMatches(cancellationItem, item)
    );
    if (fullCancellation) {
      await calendar.deleteItem(item);
      return true;
    }

    if (!item.recurrenceInfo) {
      const matchingOccurrence = cancellationItems.some(cancellationItem => {
        const targetItem = cancellationTarget(item, cancellationItem.recurrenceId);
        return targetItem && cancellationMatches(cancellationItem, targetItem);
      });
      if (matchingOccurrence) {
        await calendar.deleteItem(item);
      }
      return matchingOccurrence;
    }

    const updatedItem = item.clone();
    let modified = false;
    for (const cancellationItem of cancellationItems) {
      if (!cancellationItem.recurrenceId) {
        continue;
      }
      const targetItem = cancellationTarget(item, cancellationItem.recurrenceId);
      if (targetItem && cancellationMatches(cancellationItem, targetItem)) {
        updatedItem.recurrenceInfo.removeOccurrenceAt(cancellationItem.recurrenceId);
        modified = true;
      }
    }
    if (modified) {
      await calendar.modifyItem(updatedItem, item);
    }
    return modified;
  }

  function cancellationCandidate(calendar, item, targetItem, cancellationItem) {
    return {
      calendarId: calendar.id,
      itemId: item.id,
      calendarName: calendar.name,
      title: targetItem.title || cancellationItem.title || "",
      ...(dateTimeIso(targetItem.startDate) ? {
        startDate: dateTimeIso(targetItem.startDate),
      } : {}),
      ...(dateTimeIso(targetItem.endDate) ? {
        endDate: dateTimeIso(targetItem.endDate),
      } : {}),
      allDay: Boolean(targetItem.startDate?.isDate),
      ...(organizerLabel(targetItem.organizer) ? {
        organizer: organizerLabel(targetItem.organizer),
      } : {}),
      recurrenceId: cancellationItem.recurrenceId?.icalString || null,
    };
  }

  async function deleteCancellation(icalText, calendarId, itemId, recurrenceId) {
    const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(
      Ci.calIItipItem
    );
    itipItem.init(icalText);
    try {
      if (String(itipItem.receivedMethod || "").toUpperCase() !== "CANCEL") {
        return { status: "mismatch" };
      }
      const cancellationItem = itipItem.getItemList().find(item =>
        recurrenceId
          ? item.recurrenceId?.icalString === recurrenceId
          : !item.recurrenceId
      );
      if (!cancellationItem || cancellationItem.id !== itemId) {
        return { status: "mismatch" };
      }

      const calendar = cal.manager.getCalendarById(calendarId);
      if (!calendar || calendar.id === PREVIEW_CALENDAR_ID) {
        return { status: "missing" };
      }
      const item = await withTimeout(
        Promise.resolve().then(() => localCalendarCache(calendar).getItem(itemId)),
        ITEM_LOOKUP_TIMEOUT_MS,
        "Calendar lookup timed out"
      );
      if (!item) {
        return { status: "missing" };
      }
      const targetItem = cancellationTarget(item, cancellationItem.recurrenceId);
      if (!targetItem || !cancellationMatches(cancellationItem, targetItem)) {
        return { status: "mismatch" };
      }

      if (!cancellationItem.recurrenceId || !item.recurrenceInfo) {
        await withTimeout(
          calendar.deleteItem(item),
          TRANSFER_TIMEOUT_MS,
          "Calendar deletion timed out"
        );
      } else {
        const updatedItem = item.clone();
        updatedItem.recurrenceInfo.removeOccurrenceAt(cancellationItem.recurrenceId);
        await withTimeout(
          calendar.modifyItem(updatedItem, item),
          TRANSFER_TIMEOUT_MS,
          "Calendar modification timed out"
        );
      }
      return { status: "deleted" };
    } finally {
      cal.itip.cleanupItipItem(itipItem);
    }
  }

  function dateTimeIso(dateTime) {
    try {
      return dateTime?.jsDate?.toISOString() || "";
    } catch {
      return "";
    }
  }

  function organizerLabel(organizer) {
    return organizer?.commonName || normalizeEmail(organizer?.id);
  }

  function calendarHasIndexedItem(calendar, itemId) {
    const itemIndex = calendarItemIndex(calendar);
    return Boolean(itemIndex && Object.hasOwn(itemIndex, itemId));
  }

  function calendarItemIndex(calendar) {
    const facade = calendar?.wrappedJSObject || calendar;
    const uncachedCalendar = facade?.mUncachedCalendar;
    const uncached = uncachedCalendar?.wrappedJSObject || uncachedCalendar;
    return uncached?.mItemInfoCache || facade?.mItemInfoCache || null;
  }

  function localCalendarCache(calendar) {
    const facade = calendar?.wrappedJSObject || calendar;
    return facade?.mCachedCalendar || calendar;
  }

  function findCalendarAttendee(item, calendar) {
    try {
      const identity = calendar.getProperty("imip.identity");
      const email = normalizeEmail(identity?.email);
      return email
        ? item.getAttendees().find(attendee => normalizeEmail(attendee.id) === email)
        : null;
    } catch {
      return null;
    }
  }

  function findInvitedAttendee(item, calendar) {
    const calendarAttendee = findCalendarAttendee(item, calendar);
    if (calendarAttendee) {
      return calendarAttendee;
    }

    const identityEmails = new Set(
      MailServices.accounts.allIdentities
        .map(identity => identity.email?.trim().toLowerCase())
        .filter(Boolean)
    );
    return item.getAttendees().find(attendee =>
      identityEmails.has(normalizeEmail(attendee.id))
    );
  }

  function normalizeEmail(value) {
    return String(value || "")
      .replace(/^mailto:/i, "")
      .trim()
      .toLowerCase();
  }

  function compareCalendars(first, second) {
    const firstDefault = Boolean(first.getProperty("calendar-main-default"));
    const secondDefault = Boolean(second.getProperty("calendar-main-default"));
    if (firstDefault !== secondDefault) {
      return firstDefault ? -1 : 1;
    }
    const firstVisible = Boolean(first.getProperty("calendar-main-in-composite"));
    const secondVisible = Boolean(second.getProperty("calendar-main-in-composite"));
    if (firstVisible !== secondVisible) {
      return firstVisible ? -1 : 1;
    }
    return first.name.localeCompare(second.name);
  }

  function markPending(item, extensionId, sourceId, targetCalendarId) {
    const stampTime = item.stampTime;
    const lastModifiedTime = item.lastModifiedTime;
    const originalTransparency = item.getProperty("TRANSP");
    item.setProperty(OWNER_PROPERTY, extensionId);
    item.setProperty(SOURCE_PROPERTY, sourceId);
    item.setProperty(TARGET_CALENDAR_PROPERTY, targetCalendarId);
    item.setProperty(
      ORIGINAL_TRANSP_PROPERTY,
      originalTransparency == null ? DEFAULT_TRANSP : originalTransparency
    );
    item.setProperty("TRANSP", "TRANSPARENT");
    restoreRevisionTimes(item, stampTime, lastModifiedTime);
  }

  function restoreTransparency(item) {
    const stampTime = item.stampTime;
    const lastModifiedTime = item.lastModifiedTime;
    const originalTransparency = item.getProperty(ORIGINAL_TRANSP_PROPERTY);
    if (originalTransparency === DEFAULT_TRANSP) {
      item.deleteProperty("TRANSP");
    } else if (originalTransparency) {
      item.setProperty("TRANSP", originalTransparency);
    }
    item.deleteProperty(OWNER_PROPERTY);
    item.deleteProperty(SOURCE_PROPERTY);
    item.deleteProperty(ORIGINAL_TRANSP_PROPERTY);
    restoreRevisionTimes(item, stampTime, lastModifiedTime);
  }

  function copyPreviewMetadata(item, sourceItem) {
    for (const property of [
      OWNER_PROPERTY,
      SOURCE_PROPERTY,
      ORIGINAL_TRANSP_PROPERTY,
      TARGET_CALENDAR_PROPERTY,
    ]) {
      const value = sourceItem.getProperty(property);
      if (value != null) {
        item.setProperty(property, value);
      }
    }
  }

  async function preserveTransferMetadata(item, sourceItem) {
    const preservedItem = item.clone();
    copyPreviewMetadata(preservedItem, sourceItem);
    restoreOriginalTransparency(preservedItem);
    return item.calendar.modifyItem(preservedItem, item);
  }

  function restoreOriginalTransparency(item) {
    const originalTransparency = item.getProperty(ORIGINAL_TRANSP_PROPERTY);
    if (originalTransparency === DEFAULT_TRANSP) {
      item.deleteProperty("TRANSP");
    } else if (originalTransparency) {
      item.setProperty("TRANSP", originalTransparency);
    }
  }

  function restoreRevisionTimes(item, stampTime, lastModifiedTime) {
    if (stampTime) {
      item.setProperty("DTSTAMP", stampTime);
    }
    if (lastModifiedTime) {
      item.setProperty("LAST-MODIFIED", lastModifiedTime);
    }
  }

  function participationStatus(item) {
    return cal.itip.getInvitedAttendee(item, item?.calendar)?.participationStatus || "";
  }

  function isPreview(item, extensionId) {
    return item?.getProperty(OWNER_PROPERTY) === extensionId;
  }

  function result(status, pending = false, calendarId, itemId, targetCalendar) {
    return {
      status,
      pending,
      ...(calendarId ? { calendarId } : {}),
      ...(itemId ? { itemId } : {}),
      ...(targetCalendar ? {
        targetCalendarId: targetCalendar.id,
        targetCalendarName: targetCalendar.name,
      } : {}),
    };
  }

  function withTimeout(promise, timeoutMs, message) {
    let timeout;
    return Promise.race([
      promise,
      new Promise((_, rejectPromise) => {
        timeout = setTimeout(() => rejectPromise(new Error(message)), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timeout));
  }

}