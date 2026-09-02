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
    if (
      candidate.method === "REQUEST" &&
      (await processedStore.isCancelled(candidate.eventScopes))
    ) {
      outcomes.push({ status: "cancelled", candidate });
      await processedStore.mark(candidate.fingerprint);
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

    if (outcome.pending && outcome.calendarId && outcome.itemId) {
      await processedStore.trackPreview({
        sourceId: candidate.fingerprint,
        calendarId: outcome.calendarId,
        itemId: outcome.itemId,
        icalText: candidate.icalText,
        preferredCalendarId: settings.preferredCalendarId || null,
      });
    }
    if (outcome.status === "cancellationPending") {
      for (const cancellation of outcome.cancellations || []) {
        await processedStore.trackCancellation({
          ...cancellation,
          sourceId: candidate.fingerprint,
          icalText: candidate.icalText,
          receivedAt: messageTimestamp(message),
        });
      }
    }
    if (
      candidate.method === "CANCEL" &&
      (outcome.status === "cancelled" || outcome.status === "cancellationPending")
    ) {
      await processedStore.recordCancellation(
        candidate.eventScopes,
        messageTimestamp(message)
      );
    }
    if (outcome.status !== "noCalendar" && outcome.status !== "calendarError") {
      await processedStore.mark(candidate.fingerprint);
    }
  }

  return outcomes;
}

function messageTimestamp(message) {
  const timestamp = new Date(message.date).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}