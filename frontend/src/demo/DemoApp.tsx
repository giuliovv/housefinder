import { useEffect, useRef, useState } from "react";
import { useFont, useNoIndex } from "../lab/common";
import { demoHomes, demoMatchScore, demoPrice, type DemoHome } from "./data";
import "./demo.css";

type Tab = "style" | "browse" | "saved";
type Decision = "like" | "pass" | "skip";

const FONT = "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Instrument+Serif:ital@1&family=DM+Mono:wght@500";

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
  const pointer = useRef<{ x: number; dx: number; active: boolean }>({ x: 0, dx: 0, active: false });

  useEffect(() => {
    document.documentElement.classList.add("demo-page");
    return () => document.documentElement.classList.remove("demo-page");
  }, []);

  const current = demoHomes.find((home) => !decisions[home.id]);
  const liked = demoHomes.filter((home) => decisions[home.id] === "like");
  const passed = demoHomes.filter((home) => decisions[home.id] === "pass");
  const hasTaste = liked.length >= 3 && passed.length >= 2;
  const strongRead = liked.length >= 5 && passed.length >= 4;
  const tasteLabel = strongRead ? "A strong read on your taste" : hasTaste ? "Getting a feel for your taste" : "Learning your taste";
  const tasteStyle = liked.length ? [...liked].sort((a, b) => liked.filter((x) => x.style === b.style).length - liked.filter((x) => x.style === a.style).length)[0].style : null;

  const browse = [...demoHomes].sort((a, b) => {
    if (sort === "taste" && liked.length >= 2) {
      const difference = demoMatchScore(b, liked) - demoMatchScore(a, liked);
      if (difference) return difference;
    }
    return a.price_pcm - b.price_pcm;
  });

  function decide(home: DemoHome, choice: Decision) {
    setDecisions((before) => ({ ...before, [home.id]: choice }));
    setDrag(0);
  }

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
  }, [current, selected, tab]);

  function endDrag() {
    pointer.current.active = false;
    if (current && pointer.current.dx > 75) decide(current, "like");
    else if (current && pointer.current.dx < -75) decide(current, "pass");
    else setDrag(0);
  }

  function reset() {
    setDecisions({});
    setSaved([]);
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
        <div className="demo-header__brand"><span>House Swipe</span><span className="demo-header__flag">DEMO</span></div>
        <p>Fictional homes, agencies and prices · generated interiors</p>
        <nav className="demo-tabs" aria-label="Demo sections">
          <button className={tab === "style" ? "is-active" : ""} onClick={() => setTab("style")}>Style</button>
          <button className={tab === "browse" ? "is-active" : ""} onClick={() => setTab("browse")}>Browse <i>{demoHomes.length}</i></button>
          <button className={tab === "saved" ? "is-active" : ""} onClick={() => setTab("saved")}>Saved{saved.length ? ` ${saved.length}` : ""}</button>
        </nav>
      </header>

      {tab === "style" && (current ? (
        <section className="demo-style" aria-label="Choose your style">
          <div
            className="demo-style__stage"
            onPointerDown={(event) => { pointer.current = { x: event.clientX, dx: 0, active: true }; event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={(event) => { if (pointer.current.active) { pointer.current.dx = event.clientX - pointer.current.x; setDrag(pointer.current.dx); } }}
            onPointerUp={endDrag}
            onPointerCancel={() => { pointer.current.active = false; setDrag(0); }}
            style={{ touchAction: "pan-y" }}
          >
            <div className="demo-style__moving" style={{ transform: `translateX(${drag}px) rotate(${drag / 25}deg)` }}>
              <DemoPhoto home={current} />
              {Math.abs(drag) > 25 && <span className={`demo-style__stamp ${drag > 0 ? "demo-style__stamp--like" : "demo-style__stamp--pass"}`}>{drag > 0 ? "LIKE" : "PASS"}</span>}
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
            <div className="demo-style__foot"><span>← Drag to pass · Drag to like →</span><button onClick={reset}>Reset demo</button></div>
          </div>
        </section>
      ) : (
        <section className="demo-empty"><p className="demo-kicker">THAT'S THE SET</p><h1>You've seen every <em>room.</em></h1><p>See the fictional homes ranked by what you liked.</p><button onClick={() => setTab("browse")}>Browse 16 homes →</button><button onClick={reset}>Start again</button></section>
      ))}

      {tab === "browse" && <section className="demo-browse">
        <div className="demo-browse__top"><div><p className="demo-kicker">THE FICTIONAL CATALOGUE</p><h1>16 <em>homes</em></h1></div><button className="demo-sort" onClick={() => setSort(sort === "taste" ? "price" : "taste")}>{sort === "taste" && liked.length >= 2 ? "Nearer your taste" : "Lowest price"} ↓</button></div>
        <p className="demo-browse__hint">No real properties or agency links. Tap a photo to preview.</p>
        <div className="demo-browse__list">{browse.map(homeCard)}</div>
      </section>}

      {tab === "saved" && <section className="demo-browse demo-saved"><div className="demo-browse__top"><div><p className="demo-kicker">YOUR FILMING SHORTLIST</p><h1>Short<em>list</em></h1></div><span>{saved.length} saved</span></div>{saved.length ? <div className="demo-browse__list">{demoHomes.filter((home) => saved.includes(home.id)).map(homeCard)}</div> : <div className="demo-empty"><h2>Nothing saved <em>yet.</em></h2><p>Save a fictional home from Browse to see it here.</p><button onClick={() => setTab("browse")}>Browse homes</button></div>}</section>}

      {selected && <div className="demo-modal" role="presentation" onClick={() => setSelected(null)}><section className="demo-modal__card" role="dialog" aria-modal="true" aria-label={`Preview ${selected.street}`} onClick={(event) => event.stopPropagation()}><button className="demo-modal__close" onClick={() => setSelected(null)} aria-label="Close preview">×</button><DemoPhoto home={selected} /><div><p className="demo-kicker">FICTIONAL LISTING · {selected.agency}</p><h2>{selected.street}</h2><p>{selected.area} {selected.postcode} · {selected.bedrooms === 0 ? "Studio" : `${selected.bedrooms} bed`} · {demoPrice(selected.price_pcm)} pcm</p><small>Generated photo and invented listing for a product demo. This home is not available to rent.</small></div></section></div>}
    </main>
  );
}
