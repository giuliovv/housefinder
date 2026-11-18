import { useCallback, useEffect, useMemo, useState } from "react";
import { setPageMeta } from "./lib/seo";
import { useFont } from "./lab/common";
import "./stats-page.css";

interface Row { day: string; [counter: string]: number | string }
interface SourceRow { day: string; source: string; campaign: string; [counter: string]: number | string }
interface Report { days: number; daily: Row[]; sources: SourceRow[] }

const KEY = "housefinder:stats-password";
const FONT = "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,700;12..96,800";
const n = (r: Row | SourceRow, k: string) => Number(r[k] ?? 0);
const sum = (rows: (Row | SourceRow)[], k: string) => rows.reduce((t, r) => t + n(r, k), 0);
const share = (a: number, b: number) => (b > 0 ? a / b : 0);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");

/** each step of the journey, in order; every one is "new browsers that got this far", so it reads as a funnel */
const FUNNEL: [string, string][] = [
  ["visitors", "Opened the site"],
  ["m_first_swipe", "Swiped a photo"],
  ["m_swipes_10", "Swiped 10 photos"],
  ["m_swipes_25", "Swiped 25 photos"],
  ["m_ready_shown", "Saw the ready card"],
  ["m_browse_opened", "Opened Browse"],
  ["m_filter_used", "Used a filter"],
  ["m_agency_click", "Opened an agency listing"],
  ["m_saved", "Saved a home"],
  ["m_share_created", "Started a shared list"],
];

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

/** Private usage statistics, made for a phone. Not linked from anywhere; the numbers come from /api/stats, which needs the password. */
export default function StatsPage() {
  useFont(FONT);
  const [password, setPassword] = useState(() => sessionStorage.getItem(KEY) ?? "");
  const [input, setInput] = useState("");
  const [days, setDays] = useState(14);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPageMeta({ title: "Stats", noindex: true });
  }, []);

  const load = useCallback(async (pw: string, range: number) => {
    setLoading(true);
    setError(null);
    try {
      // twice the range, so the period can be compared with the one before it
      const res = await fetch(`/api/stats?days=${range * 2}`, { headers: { "x-stats-password": pw }, cache: "no-store" });
      if (res.status === 401) {
        sessionStorage.removeItem(KEY);
        setPassword("");
        setReport(null);
        setError("That password is wrong.");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport(await res.json());
      sessionStorage.setItem(KEY, pw);
    } catch (e) {
      setError(`The numbers didn't load (${e instanceof Error ? e.message : "error"}). Try again.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (password) void load(password, days);
  }, [password, days, load]);

  const { cur, prev, sources, strip } = useMemo(() => {
    const cutoff = isoDaysAgo(days - 1);
    const all = report?.daily ?? [];
    const cur = all.filter((r) => r.day >= cutoff);
    const prev = all.filter((r) => r.day < cutoff);
    // one column per calendar day, including days with no visits
    const byDay = new Map(cur.map((r) => [r.day, r]));
    const strip = Array.from({ length: days }, (_, i) => {
      const day = isoDaysAgo(days - 1 - i);
      return { day, news: n(byDay.get(day) ?? { day }, "visitors_new"), visits: n(byDay.get(day) ?? { day }, "visitors") };
    });
    const map = new Map<string, SourceRow>();
    for (const r of (report?.sources ?? []).filter((s) => s.day >= cutoff)) {
      const k = `${r.source}~${r.campaign}`;
      const acc = map.get(k) ?? ({ day: "", source: r.source, campaign: r.campaign } as SourceRow);
      for (const [key, value] of Object.entries(r)) if (typeof value === "number") acc[key] = n(acc, key) + value;
      map.set(k, acc);
    }
    return { cur, prev, strip, sources: [...map.values()].sort((a, b) => n(b, "visitors_new") - n(a, "visitors_new")) };
  }, [report, days]);

  if (!password || !report) {
    return (
      <main className="st st--login">
        <h1>Stats</h1>
        <form onSubmit={(e) => { e.preventDefault(); if (input) setPassword(input); }}>
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" autoComplete="current-password" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          <button type="submit" disabled={loading || !input}>{loading ? "Checking" : "Open stats"}</button>
          {error && <p className="st__error" role="alert">{error}</p>}
        </form>
      </main>
    );
  }

  const visits = sum(cur, "visitors");
  const fresh = sum(cur, "visitors_new");
  const before = sum(prev, "visitors_new");
  const diff = fresh - before;
  const peak = Math.max(1, ...strip.map((s) => s.news));
  const matchShown = sum(cur, "ev_match_shown");
  const matchHit = sum(cur, "ev_match_hit");
  const matchMiss = sum(cur, "ev_match_miss");

  return (
    <main className="st">
      <header className="st__bar">
        <h1>Stats</h1>
        <div className="st__range" role="group" aria-label="Time range">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} aria-pressed={d === days} onClick={() => setDays(d)}>{d}d</button>
          ))}
        </div>
        <button className="st__lock" onClick={() => { sessionStorage.removeItem(KEY); setPassword(""); setReport(null); }}>Lock</button>
      </header>
      {error && <p className="st__error" role="alert">{error}</p>}

      <section className="st__hero" aria-label="New browsers">
        <p className="st__big"><b>{fresh}</b> new browsers</p>
        <p className="st__sub">
          in the last {days} days, from {visits} visits.
          {prev.length > 0 && (
            <> {diff === 0 ? `Same as the ${days} days before.` : `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than the ${days} days before (${before}).`}</>
          )}
        </p>
        <div className="st__strip" role="img" aria-label={`New browsers per day over ${days} days, busiest day ${peak}`}>
          {strip.map((s) => (
            <span key={s.day} className="st__col" title={`${dayLabel(s.day)}: ${s.news} new, ${s.visits} visits`}>
              <i style={{ height: `${Math.max(s.news > 0 ? 6 : 2, (s.news / peak) * 100)}%` }} />
            </span>
          ))}
        </div>
        <div className="st__ends"><span>{dayLabel(strip[0].day)}</span><span>Today</span></div>
      </section>

      <section className="st__rates" aria-label="How visitors behave">
        <p><b>{pct(sum(cur, "m_first_swipe"), visits)}</b> swiped a photo</p>
        <p><b>{pct(sum(cur, "m_browse_opened"), visits)}</b> opened Browse</p>
        <p><b>{pct(sum(cur, "m_agency_click"), visits)}</b> opened an agency listing</p>
      </section>

      <section>
        <h2>Where people drop off</h2>
        <p className="st__note">Each browser counts once, the first time it gets there. The bar is the share of visits.</p>
        <ol className="st__funnel">
          {FUNNEL.map(([k, label]) => {
            const value = sum(cur, k);
            return (
              <li key={k}>
                <span className="st__fl">{label}</span>
                <span className="st__fv"><b>{value}</b> {pct(value, visits)}</span>
                <span className="st__fbar"><i style={{ width: `${Math.min(100, share(value, visits) * 100)}%` }} /></span>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <h2>Where they came from</h2>
        {sources.length === 0 ? (
          <p className="st__note">Nothing tagged yet. Links need <code>?utm_source=tiktok&amp;utm_campaign=demo1</code> or similar.</p>
        ) : (
          <ul className="st__sources">
            {sources.map((r) => {
              const base = n(r, "visitors_new") || n(r, "visitors");
              return (
                <li key={`${r.source}~${r.campaign}`}>
                  <p className="st__sname"><b>{r.source}</b>{r.campaign ? ` / ${r.campaign}` : ""}</p>
                  <p className="st__snums"><b>{n(r, "visitors_new")}</b> new browsers, {pct(n(r, "m_first_swipe"), base)} swiped, {pct(n(r, "m_browse_opened"), base)} browsed, {pct(n(r, "m_agency_click"), base)} opened a listing</p>
                  <span className="st__fbar"><i style={{ width: `${Math.min(100, share(n(r, "m_first_swipe"), base) * 100)}%` }} /></span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="st__note">A browser counts for the link it first arrived from, including on later visits.</p>
      </section>

      <section>
        <h2>"It's a match!" moments</h2>
        <p>{matchShown} offered, {matchHit} liked, {matchMiss} passed{matchHit + matchMiss > 0 ? ` (${pct(matchHit, matchHit + matchMiss)} liked)` : ""}, {sum(cur, "ev_match_opened")} opened the home.</p>
      </section>

      {(sum(cur, "ab_w_on_new") + sum(cur, "ab_w_off_new")) > 0 && (
        <section>
          <h2>Welcome screen test</h2>
          <p className="st__sub">New browsers only. "With" sees the welcome screen first; "without" goes straight to the first photo.</p>
          <table className="st__ab">
            <thead><tr><th></th><th>New</th><th>Tapped start</th><th>Swiped</th><th>10 swipes</th><th>Browse</th></tr></thead>
            <tbody>
              {(["on", "off"] as const).map((arm) => {
                const base = sum(cur, `ab_w_${arm}_new`);
                const cell = (k: string) => `${sum(cur, `ab_w_${arm}_${k}`)} · ${pct(sum(cur, `ab_w_${arm}_${k}`), base)}`;
                return (
                  <tr key={arm}>
                    <th>{arm === "on" ? "With" : "Without"}</th><td>{base}</td><td>{arm === "on" ? cell("start") : "–"}</td><td>{cell("swipe")}</td><td>{cell("swipe10")}</td><td>{cell("browse")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <details className="st__days">
        <summary>Day by day</summary>
        <table>
          <thead><tr><th scope="col">Day</th><th scope="col">Visits</th><th scope="col">New</th><th scope="col">Swiped</th><th scope="col">Clicks</th></tr></thead>
          <tbody>
            {[...cur].reverse().map((r) => (
              <tr key={r.day}>
                <th scope="row">{dayLabel(r.day)}</th>
                <td>{n(r, "visitors")}</td><td>{n(r, "visitors_new")}</td><td>{n(r, "m_first_swipe")}</td><td>{n(r, "m_agency_click")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {loading && <p className="st__note" role="status">Updating</p>}
    </main>
  );
}
