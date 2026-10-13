/** Price history from price-history.json: `{listing key: [[day, pcm], ...]}` for homes whose rent really changed. */
export type PricePoint = [string, number];
export type PriceHistory = Record<string, PricePoint[]>;

export interface PriceDrop {
  from: number;
  to: number;
  amount: number;
  day: string;
}

/** the latest move, if it was downwards */
export function latestDrop(series: PricePoint[] | undefined): PriceDrop | null {
  if (!series || series.length < 2) return null;
  const [, prev] = series[series.length - 2];
  const [day, now] = series[series.length - 1];
  return now < prev ? { from: prev, to: now, amount: Math.round(prev - now), day } : null;
}

export const gbp = (n: number): string => `£${Math.round(n).toLocaleString("en-GB")}`;

export function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** geometry for the step chart: x in [x0, x1] by date, y by price (higher price = higher up) */
export function chartGeometry(
  series: PricePoint[],
  today: string,
  box: { x0: number; x1: number; yTop: number; yBottom: number },
): { points: { x: number; y: number; day: string; price: number }[]; endX: number } {
  const t = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
  const start = t(series[0][0]);
  const end = Math.max(t(series[series.length - 1][0]) + 86_400_000, t(today));
  const prices = series.map((p) => p[1]);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const spread = Math.max(hi - lo, hi * 0.04); // a flat-ish history shouldn't be stretched to the full height
  const mid = (hi + lo) / 2;
  const yOf = (price: number) => box.yBottom - ((price - (mid - spread / 2)) / spread) * (box.yBottom - box.yTop);
  const xOf = (day: string) => box.x0 + ((t(day) - start) / (end - start)) * (box.x1 - box.x0);
  return { points: series.map(([day, price]) => ({ x: xOf(day), y: yOf(price), day, price })), endX: box.x1 };
}
