import { normalizeSettings } from "../src/infrastructure/extension-state-store.js";

localizeDocument();

const form = document.querySelector("form");
const enabledInput = document.querySelector("#enabled");
const historyDaysInput = document.querySelector("#history-days");
const calendarSelect = document.querySelector("#preferred-calendar");
const status = document.querySelector("#status");
const stored = await messenger.storage.local.get("settings");
const settings = normalizeSettings(stored.settings);

enabledInput.checked = settings.enabled;
historyDaysInput.value = String(settings.historyDays);
await populateCalendars(settings.preferredCalendarId);

form.addEventListener("change", async () => {
  if (!form.reportValidity()) {
    return;
  }
  await messenger.storage.local.set({
    settings: {
      enabled: enabledInput.checked,
      historyDays: Number.parseInt(historyDaysInput.value, 10),
      preferredCalendarId: calendarSelect.value || null,
    },
  });
  status.textContent = message("settingsSaved");
});

async function populateCalendars(selectedId) {
  const calendars = await messenger.invitationPreview.listCalendars();
  calendarSelect.append(new Option(message("automaticCalendar"), ""));

  for (const calendar of calendars) {
    const suffix = calendar.isDefault ? " *" : "";
    calendarSelect.append(new Option(`${calendar.name}${suffix}`, calendar.id));
  }

  if (selectedId && !calendars.some(calendar => calendar.id === selectedId)) {
    calendarSelect.append(new Option(message("calendarUnavailable"), selectedId));
  }
  calendarSelect.value = selectedId || "";
  calendarSelect.disabled = calendars.length === 0;
  if (calendars.length === 0) {
    status.textContent = message("noCalendars");
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