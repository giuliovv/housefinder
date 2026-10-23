/** Allow the scheduled check and retry window before warning about stale listings. */
export function staleLabelDays(lastSeen?: string, today?: string): number | null {
  if (!lastSeen || !today) return null;
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastSeen}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(days) && days >= 4 ? days : null;
}
