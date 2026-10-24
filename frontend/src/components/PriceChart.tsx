import { chartGeometry, gbp, shortDay, type PricePoint } from "../lib/priceHistory";

const W = 300;
const H = 78;
const BOX = { x0: 14, x1: W - 14, yTop: 26, yBottom: 52 };

/**
 * One home's rent over time: a step line (the price holds until it changes), the first and latest price labelled
 * directly, nothing else. One series, no axis or legend; the figures are also in the text caption and the
 * accessible description.
 */
export function PriceChart({ series, today }: { series: PricePoint[]; today: string }) {
  const g = chartGeometry(series, today, BOX);
  const pts = g.points;
  const last = pts[pts.length - 1];
  // step path: horizontal to each change, then vertical to the new price, then on to the right edge
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` H ${pts[i].x} V ${pts[i].y}`;
  d += ` H ${g.endX}`;
  const firstHigher = pts[0].price >= last.price;
  const label = (p: (typeof pts)[number], above: boolean, anchor: "start" | "end") => (
    <text x={p.x} y={above ? p.y - 11 : p.y + 20} textAnchor={anchor} className="price-chart__label">
      {gbp(p.price)}
    </text>
  );
  const nearRight = last.x > W * 0.62;
  const description = `Rent history: ${series.map(([day, price]) => `${gbp(price)} from ${shortDay(day)}`).join(", then ")}.`;
  return (
    <figure className="price-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={description}>
        <path d={d} className="price-chart__line" />
        {pts.map((p, i) => (
          <circle key={p.day} cx={p.x} cy={p.y} r={i === 0 || i === pts.length - 1 ? 4.5 : 3.5} className="price-chart__dot">
            <title>{`${gbp(p.price)} from ${shortDay(p.day)}`}</title>
          </circle>
        ))}
        {label(pts[0], firstHigher, "start")}
        {label(last, !firstHigher, nearRight ? "end" : "start")}
      </svg>
      <figcaption className="price-chart__caption">
        {shortDay(series[0][0])} → {shortDay(series[series.length - 1][0])}: {gbp(series[0][1])} → {gbp(series[series.length - 1][1])}
      </figcaption>
    </figure>
  );
}
