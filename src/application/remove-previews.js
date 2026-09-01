export async function removeTrackedPreviews(previews, removePreview) {
  const outcomes = await Promise.allSettled(
    previews.map(preview => removePreview(preview.calendarId, preview.itemId))
  );
  const remainingPreviews = [];
  let removedCount = 0;

  for (const [index, outcome] of outcomes.entries()) {
    if (outcome.status === "fulfilled" && outcome.value === true) {
      removedCount += 1;
    } else {
      remainingPreviews.push(previews[index]);
    }
  }

  return {
    removedCount,
    failedCount: remainingPreviews.length,
    remainingPreviews,
  };
}
