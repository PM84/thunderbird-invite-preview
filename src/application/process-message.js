export async function processMessage(message, dependencies, options = {}) {
  const {
    extractors,
    calendarGateway,
    processedStore,
    settings,
  } = dependencies;

  if (!options.ignoreDisabled && !settings.enabled) {
    return [{ status: "disabled" }];
  }
  if (message.junk) {
    return [{ status: "ignoredJunk" }];
  }

  const candidates = (
    await Promise.all(extractors.map(extractor => extractor.extract(message)))
  ).flat();
  const outcomes = [];

  for (const candidate of candidates) {
    if (candidate.type !== "calendar" || !candidate.actionable) {
      outcomes.push({ status: "unsupported", candidate });
      continue;
    }
    if (!options.force && (await processedStore.has(candidate.fingerprint))) {
      outcomes.push({ status: "alreadyScanned", candidate });
      continue;
    }

    const outcome = await calendarGateway.stage(candidate, {
      preferredCalendarId: settings.preferredCalendarId || null,
      sourceId: candidate.fingerprint,
    });
    outcomes.push({ ...outcome, candidate });

    if (outcome.status !== "noCalendar" && outcome.status !== "calendarError") {
      await processedStore.mark(candidate.fingerprint);
    }
    if (outcome.pending && outcome.calendarId && outcome.itemId) {
      await processedStore.trackPreview({
        sourceId: candidate.fingerprint,
        calendarId: outcome.calendarId,
        itemId: outcome.itemId,
        icalText: candidate.icalText,
        preferredCalendarId: settings.preferredCalendarId || null,
      });
    }
  }

  return outcomes;
}