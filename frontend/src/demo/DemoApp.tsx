import { useCallback, useEffect, useRef, useState } from "react";
import { useFont, useNoIndex } from "../lab/common";
import { DEMO_MATCH_ID, demoHomes, demoMatchScore, demoPrice, demoStyleHomes, type DemoHome } from "./data";
import "./demo.css";

type Tab = "style" | "browse" | "saved";
type Decision = "like" | "pass" | "skip";

const FONT = "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Instrument+Serif:ital@1&family=DM+Mono:wght@500";
const SWIPE_DELAY_MS = 480;

function DemoPhoto({ home, className = "" }: { home: DemoHome; className?: string }) {
  return (
    <div
      className={`demo-photo demo-photo--tile-${home.tile} ${className}`}
      role="img"
      aria-label={`${home.style} interior at ${home.street}`}
      style={{ backgroundImage: `url(/demo/img/sheet-${home.sheet}.webp)` }}
    />
  );
}

export default function DemoApp() {
  useFont(FONT);
  useNoIndex();
  const [tab, setTab] = useState<Tab>("style");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [saved, setSaved] = useState<string[]>([]);
  const [selected, setSelected] = useState<DemoHome | null>(null);
  const [sort, setSort] = useState<"taste" | "price">("taste");
  const [drag, setDrag] = useState(0);
  const [exiting, setExiting] = useState<{ id: string; choice: Decision; distance: number } | null>(null);
  const exitTimer = useRef<number | null>(null);
  const exitPending = useRef(false);
  const pointer = useRef<{ x: number; dx: number; active: boolean }>({ x: 0, dx: 0, active: false });

  useEffect(() => {
    document.documentElement.classList.add("demo-page");
    return () => {
      document.documentElement.classList.remove("demo-page");
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, []);

  const current = demoStyleHomes.find((home) => !decisions[home.id]);
  const liked = demoHomes.filter((home) => decisions[home.id] === "like");
  const passed = demoHomes.filter((home) => decisions[home.id] === "pass");
  const hasTaste = liked.length >= 2;
  const strongRead = liked.length >= 5 && passed.length >= 4;
  const showMatch = Object.keys(decisions).length >= 3;
  const tasteLabel = strongRead ? "A strong read on your taste" : hasTaste ? "Getting a feel for your taste" : "Learning your taste";
  const tasteStyle = hasTaste ? "Light-filled character" : null;

  const browse = [...demoHomes].sort((a, b) => {
    if (a.sheet === 5 || b.sheet === 5) return Number(a.sheet === 5) - Number(b.sheet === 5);
    if (sort === "taste" && showMatch) {
      if (a.id === DEMO_MATCH_ID) return -1;
      if (b.id === DEMO_MATCH_ID) return 1;
    }
    if (sort === "taste" && liked.length >= 2) {
      const difference = demoMatchScore(b, liked) - demoMatchScore(a, liked);
      if (difference) return difference;
    }
    return a.price_pcm - b.price_pcm;
  });

  const decide = useCallback((home: DemoHome, choice: Decision) => {
    if (tab !== "style" || current?.id !== home.id || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDecisions((before) => ({ ...before, [home.id]: choice }));
      setDrag(0);
      return;
    }
    if (exitPending.current) return;
    exitPending.current = true;
    const distance = choice === "skip" ? 0 : (choice === "like" ? 1 : -1) * Math.max(window.innerWidth, 500);
    setExiting({ id: home.id, choice, distance });
    exitTimer.current = window.setTimeout(() => {
      setDecisions((before) => ({ ...before, [home.id]: choice }));
      setExiting(null);
      setDrag(0);
      exitPending.current = false;
      exitTimer.current = null;
    }, SWIPE_DELAY_MS);
  }, [current, tab]);

  function toggleSave(id: string) {
    setSaved((before) => before.includes(id) ? before.filter((item) => item !== id) : [...before, id]);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setSelected(null); return; }
      if (selected || tab !== "style" || !current) return;
      if (event.key === "ArrowLeft") decide(current, "pass");
      if (event.key === "ArrowRight") decide(current, "like");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, selected, tab, decide]);

  function endDrag() {
    pointer.current.active = false;
    if (exitPending.current) return;
    if (current && pointer.current.dx > 75) decide(current, "like");
    else if (current && pointer.current.dx < -75) decide(current, "pass");
    else setDrag(0);
  }

  function reset() {
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    exitTimer.current = null;
    exitPending.current = false;
    setExiting(null);
    setDecisions({});
    setSelected(null);
    setDrag(0);
    setTab("style");
  }

  function homeCard(home: DemoHome) {
    const priceDrop = home.price_history ? Number(home.price_history[0][1]) - Number(home.price_history[home.price_history.length - 1][1]) : 0;
    const choice = decisions[home.id];
    return (
      <article className="demo-listing" key={home.id}>
        <button className="demo-listing__photo-button" onClick={() => setSelected(home)} aria-label={`Preview ${home.street}`}>
          <DemoPhoto home={home} />
          <span className="demo-listing__agency">{home.agency}</span>
          {showMatch && sort === "taste" && home.id === DEMO_MATCH_ID && <span className="demo-listing__match">Nearer your taste</span>}
          {home.is_new && <span className="demo-listing__new">New</span>}
        </button>
        <div className="demo-listing__body">
          <div className="demo-listing__headline">
            <strong>{demoPrice(home.price_pcm)} <small>pcm</small></strong>
            <button className={`demo-save${saved.includes(home.id) ? " demo-save--on" : ""}`} onClick={() => toggleSave(home.id)} aria-pressed={saved.includes(home.id)}>{saved.includes(home.id) ? "★ Saved" : "☆ Save"}</button>
          </div>
          {priceDrop > 0 && <p className="demo-listing__drop">Price dropped {demoPrice(priceDrop)}</p>}
          <button className="demo-listing__detail" onClick={() => setSelected(home)}>
            <span>{home.street}, {home.area} {home.postcode}</span>
            <small>{home.bedrooms === 0 ? "Studio" : `${home.bedrooms} bed`} · {home.bathrooms} bath · Preview home ↗</small>
          </button>
          <div className="demo-listing__rate">
            <button className={choice === "pass" ? "is-on" : ""} onClick={() => decide(home, "pass")} aria-label={`Pass on ${home.street}`} aria-pressed={choice === "pass"}>×</button>
            <button className={choice === "like" ? "is-on" : ""} onClick={() => decide(home, "like")} aria-label={`Like ${home.street}`} aria-pressed={choice === "like"}>♥</button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <main className="demo-shell">
      <header className="demo-header">
        <div className="demo-header__brand"><span>House Swipe</span></div>
        <p>Find homes that feel like you.</p>
        <nav className="demo-tabs" aria-label="Sections">
          <button className={tab === "style" ? "is-active" : ""} onClick={() => setTab("style")}>Style</button>
          <button className={tab === "browse" ? "is-active" : ""} onClick={() => setTab("browse")}>Browse <i>{demoHomes.length}</i></button>
          <button className={tab === "saved" ? "is-active" : ""} onClick={() => setTab("saved")}>Saved{saved.length ? ` ${saved.length}` : ""}</button>
        </nav>
      </header>

      {tab === "style" && (current ? (
        <section className="demo-style" aria-label="Choose your style">
          <div
            className="demo-style__stage"
            onPointerDown={(event) => { if (exitPending.current) return; pointer.current = { x: event.clientX, dx: 0, active: true }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => { if (pointer.current.active) { pointer.current.dx = event.clientX - pointer.current.x; setDrag(pointer.current.dx); } }}
            onPointerUp={endDrag}
            onPointerCancel={() => { pointer.current.active = false; setDrag(0); }}
            style={{ touchAction: "pan-y" }}
          >
            <div className={`demo-style__moving${exiting ? " demo-style__moving--exiting" : pointer.current.active ? " demo-style__moving--dragging" : ""}`} style={{ transform: `translateX(${exiting?.distance ?? drag}px) rotate(${(exiting?.distance ?? drag) / 25}deg)`, opacity: exiting?.choice === "skip" ? 0 : 1 }}>
              <DemoPhoto home={current} />
              {(Math.abs(drag) > 25 || (exiting && exiting.choice !== "skip")) && <span className={`demo-style__stamp ${(exiting?.choice === "like" || (!exiting && drag > 0)) ? "demo-style__stamp--like" : "demo-style__stamp--pass"}`}>{exiting?.choice === "like" || (!exiting && drag > 0) ? "LIKE" : "PASS"}</span>}
            </div>
            <div className="demo-style__photo-note">Photo {Object.keys(decisions).length + 1} / {demoHomes.length}</div>
          </div>
          <div className="demo-style__card">
            <p className="demo-kicker">YOU LEAN TOWARD</p>
            <h1>{tasteStyle ? <>{tasteStyle.split(" ").slice(0, -1).join(" ")} <em>{tasteStyle.split(" ").at(-1)}</em></> : <>Find your <em>style</em></>}</h1>
            <p className="demo-style__read">{tasteLabel}</p>
            <div className="demo-style__actions">
              <button onClick={() => decide(current, "pass")}>× <span>Pass</span></button>
              <button className="demo-style__skip" onClick={() => decide(current, "skip")}>Skip photo</button>
              <button className="demo-style__like" onClick={() => decide(current, "like")}>♥ <span>Like</span></button>
            </div>
            <div className="demo-style__foot"><span>← Drag to pass · Drag to like →</span><button onClick={reset}>Reset taste</button></div>
          </div>
        </section>
      ) : (
        <section className="demo-empty"><p className="demo-kicker">THAT'S THE SET</p><h1>You've seen every <em>room.</em></h1><p>See homes ranked by what you liked.</p><button onClick={() => setTab("browse")}>Browse {demoHomes.length} homes →</button><button onClick={reset}>Start again</button></section>
      ))}

      {tab === "browse" && <section className="demo-browse">
        <div className="demo-browse__top"><div><p className="demo-kicker">BROWSE HOMES</p><h1>{demoHomes.length} <em>homes</em></h1></div><button className="demo-sort" onClick={() => setSort(sort === "taste" ? "price" : "taste")}>{sort === "taste" && showMatch ? "Nearer your taste" : "Price"} ↓</button></div>
        {showMatch && sort === "taste" && <div className="demo-match-note"><span>✦</span><div><strong>Looks like your kind of place</strong><small>Start with this one, then keep exploring.</small></div></div>}
        <div className="demo-browse__list">{browse.map(homeCard)}</div>
      </section>}

      {tab === "saved" && <section className="demo-browse demo-saved"><div className="demo-browse__top"><div><p className="demo-kicker">YOUR SHORTLIST</p><h1>Short<em>list</em></h1></div><span>{saved.length} saved</span></div>{saved.length ? <div className="demo-browse__list">{demoHomes.filter((home) => saved.includes(home.id)).map(homeCard)}</div> : <div className="demo-empty"><h2>Nothing saved <em>yet.</em></h2><p>Save a home from Browse to see it here.</p><button onClick={() => setTab("browse")}>Browse homes</button></div>}</section>}

      {selected && <div className="demo-modal" role="presentation" onClick={() => setSelected(null)}><section className="demo-modal__card" role="dialog" aria-modal="true" aria-label={`Preview ${selected.street}`} onClick={(event) => event.stopPropagation()}><button className="demo-modal__close" onClick={() => setSelected(null)} aria-label="Close preview">×</button><DemoPhoto home={selected} /><div><p className="demo-kicker">{selected.agency}</p><h2>{selected.street}</h2><p>{selected.area} {selected.postcode} · {selected.bedrooms === 0 ? "Studio" : `${selected.bedrooms} bed`} · {demoPrice(selected.price_pcm)} pcm</p></div></section></div>}
      <p className="demo-visually-hidden">This is a simulated demo. All homes, prices and agency names shown here are fictional.</p>
    </main>
  );
}
