export function catalogueAge(refreshedAt: string | null, now = Date.now()): { label: string; stale: boolean } {
  const checked = refreshedAt ? Date.parse(refreshedAt) : NaN;
  if (!Number.isFinite(checked)) return { label: "Catalogue check time unavailable", stale: true };
  const minutes = Math.max(0, Math.floor((now - checked) / 60_000));
  const age = minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ago` : `${Math.floor(minutes / 1440)} d ago`;
  return { label: `Catalogue updated ${age}`, stale: minutes > 360 };
}
