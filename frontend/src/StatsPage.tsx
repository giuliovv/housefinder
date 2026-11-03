import { useCallback, useEffect, useMemo, useState } from "react";
import { setPageMeta } from "./lib/seo";
import "./stats-page.css";

interface Row { day: string; [counter: string]: number | string }
interface SourceRow { day: string; source: string; campaign: string; [counter: string]: number | string }
interface Report { days: number; daily: Row[]; sources: SourceRow[] }

const KEY = "housefinder:stats-password";
const n = (r: Row | SourceRow, k: string) => Number(r[k] ?? 0);
const sum = (rows: (Row | SourceRow)[], k: string) => rows.reduce((t, r) => t + n(r, k), 0);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");

const FUNNEL: [string, string][] = [
  ["visitors", "Opened the site (per day)"],
  ["m_first_swipe", "Swiped a photo"],
  ["m_swipes_10", "10 swipes"],
  ["m_swipes_25", "25 swipes"],
  ["m_ready_shown", "Got the ready card"],
  ["m_ready_go", "…tapped See my matches"],
  ["m_browse_opened", "Opened Browse"],
  ["m_browse_deep", "Scrolled past the first page"],
  ["m_filter_used", "Used a filter"],
  ["m_map_used", "Opened the map"],
  ["m_saved", "Saved a home"],
  ["m_agency_click", "Opened an agency listing"],
  ["m_share_created", "Created a shared list"],
  ["m_share_joined", "Joined a shared list"],
];

/** Private usage statistics. Not linked from anywhere; the numbers come from /api/stats, which needs the password. */
export default function StatsPage() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(KEY) ?? "");
  const [input, setInput] = useState("");
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPageMeta({ title: "Stats", noindex: true });
  }, []);

  const load = useCallback(
    async (pw: string, range: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stats?days=${range}`, { headers: { "x-stats-password": pw }, cache: "no-store" });
        if (res.status === 401) {
          sessionStorage.removeItem(KEY);
          setPassword("");
          setReport(null);
          setError("Wrong password");
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setReport(await res.json());
        sessionStorage.setItem(KEY, pw);
      } catch (e) {
        setError(`Couldn't load the numbers (${e instanceof Error ? e.message : "error"})`);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (password) void load(password, days);
  }, [password, days, load]);

  const totals = useMemo(() => report?.daily ?? [], [report]);
  const bySource = useMemo(() => {
    const map = new Map<string, SourceRow>();
    for (const r of report?.sources ?? []) {
      const k = `${r.source}~${r.campaign}`;
      const cur = map.get(k) ?? ({ day: "", source: r.source, campaign: r.campaign } as SourceRow);
      for (const [key, value] of Object.entries(r)) if (typeof value === "number") cur[key] = n(cur, key) + value;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => n(b, "visitors_new") - n(a, "visitors_new"));
  }, [report]);

  if (!password || !report) {
    return (
      <main className="stats stats--login">
        <h1>Stats</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input) setPassword(input);
          }}
        >
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" autoComplete="current-password" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          <button type="submit" disabled={loading || !input}>{loading ? "Checking…" : "Open"}</button>
          {error && <p className="stats__error" role="alert">{error}</p>}
        </form>
      </main>
    );
  }

  const visits = sum(totals, "visitors");
  const newBrowsers = sum(totals, "visitors_new");
  const maxDay = Math.max(1, ...totals.map((r) => n(r, "visitors")));
  const matchShown = sum(totals, "ev_match_shown");
  const matchHit = sum(totals, "ev_match_hit");
  const matchMiss = sum(totals, "ev_match_miss");
  const last7 = totals.slice(-7);

  return (
    <main className="stats">
      <header className="stats__head">
        <h1>Stats</h1>
        <div className="stats__range" role="group" aria-label="Time range">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} className={d === days ? "on" : ""} onClick={() => setDays(d)}>{d} days</button>
          ))}
          <button onClick={() => { sessionStorage.removeItem(KEY); setPassword(""); setReport(null); }}>Lock</button>
        </div>
      </header>
      {error && <p className="stats__error" role="alert">{error}</p>}

      <section className="stats__cards">
        <div><b>{newBrowsers}</b><span>new browsers ({days} days)</span></div>
        <div><b>{visits}</b><span>visits</span></div>
        <div><b>{sum(last7, "visitors_new")}</b><span>new in the last 7 days</span></div>
        <div><b>{pct(sum(totals, "m_first_swipe"), visits)}</b><span>swiped a photo</span></div>
        <div><b>{pct(sum(totals, "m_browse_opened"), visits)}</b><span>opened Browse</span></div>
        <div><b>{pct(sum(totals, "m_agency_click"), visits)}</b><span>opened an agency listing</span></div>
      </section>

      <section>
        <h2>By day</h2>
        <div className="stats__table">
          <table>
            <thead>
              <tr><th>Day</th><th>Visitors</th><th></th><th>New</th><th>Mobile</th><th>Swiped</th><th>Browse</th><th>Saved</th><th>Clicks</th></tr>
            </thead>
            <tbody>
              {[...totals].reverse().map((r) => (
                <tr key={r.day}>
                  <td>{r.day}</td>
                  <td>{n(r, "visitors")}</td>
                  <td><i className="stats__bar" style={{ width: `${(n(r, "visitors") / maxDay) * 100}%` }} /></td>
                  <td>{n(r, "visitors_new")}</td>
                  <td>{n(r, "visitors_mobile")}</td>
                  <td>{n(r, "m_first_swipe")}</td>
                  <td>{n(r, "m_browse_opened")}</td>
                  <td>{n(r, "m_saved")}</td>
                  <td>{n(r, "m_agency_click")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Funnel</h2>
        <p className="stats__note">Each browser counts once, the first time it gets there, so these read as "new browsers that got this far". The percentage is of visits.</p>
        <div className="stats__table">
          <table>
            <tbody>
              {FUNNEL.map(([k, label]) => (
                <tr key={k}><td>{label}</td><td>{sum(totals, k)}</td><td>{pct(sum(totals, k), visits)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>By source</h2>
        {bySource.length === 0 ? (
          <p className="stats__note">No tagged visits yet. Links need <code>?utm_source=tiktok&amp;utm_campaign=demo1</code> or similar.</p>
        ) : (
          <div className="stats__table">
            <table>
              <thead>
                <tr><th>Source</th><th>Campaign</th><th>New</th><th>Visits</th><th>Swiped</th><th>25 swipes</th><th>Browse</th><th>Saved</th><th>Clicks</th><th>Swipe %</th><th>Click %</th></tr>
              </thead>
              <tbody>
                {bySource.map((r) => {
                  const base = n(r, "visitors_new") || n(r, "visitors");
                  return (
                    <tr key={`${r.source}~${r.campaign}`}>
                      <td>{r.source}</td><td>{r.campaign || "–"}</td>
                      <td>{n(r, "visitors_new")}</td><td>{n(r, "visitors")}</td><td>{n(r, "m_first_swipe")}</td><td>{n(r, "m_swipes_25")}</td>
                      <td>{n(r, "m_browse_opened")}</td><td>{n(r, "m_saved")}</td><td>{n(r, "m_agency_click")}</td>
                      <td>{pct(n(r, "m_first_swipe"), base)}</td><td>{pct(n(r, "m_agency_click"), base)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="stats__note">First touch: a browser counts for the link it first arrived from, including on later visits. Percentages are of new browsers.</p>
      </section>

      <section>
        <h2>Match moments</h2>
        <p>{matchShown} offered, {matchHit} liked, {matchMiss} passed{matchHit + matchMiss > 0 ? ` (${pct(matchHit, matchHit + matchMiss)} hit rate)` : ""}, {sum(totals, "ev_match_opened")} opened the home.</p>
      </section>
      {loading && <p className="stats__note">Loading…</p>}
    </main>
  );
}
