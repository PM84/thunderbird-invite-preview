export function summarizeOutcomes(outcomes) {
  const statuses = outcomes.map(outcome => outcome.status);
  const errorCount = countStatus(statuses, "error");
  const calendarErrorCount = countStatus(statuses, "calendarError");
  return {
    scannedCount: outcomes.length,
    stagedCount:
      countStatus(statuses, "staged") + countStatus(statuses, "updated"),
    cancellationCount: countStatus(statuses, "cancellationPending"),
    noCalendarCount: countStatus(statuses, "noCalendar"),
    error: errorCount > 0,
    errorCount,
    calendarErrorCount,
  };
}

function countStatus(statuses, expectedStatus) {
  return statuses.filter(status => status === expectedStatus).length;
}
