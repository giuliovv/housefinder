import { useCallback, useEffect, useRef, useState } from "react";
import { useFont, useNoIndex } from "../lab/common";
import { DEMO_MATCH_ID, demoGallery, demoHomes, demoPrice, demoPriceDrop, demoShareUrl, demoStyleHomes, nextDemoStyleHome, orderDemoBrowse, readDemoShare, shouldOfferDemoMatch, type DemoHome, type DemoPhotoRef } from "./data";
import "./demo.css";

type Tab = "style" | "browse" | "saved";
type Decision = "like" | "pass" | "skip";

const FONT = "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Instrument+Serif:ital@1&family=DM+Mono:wght@500";
const SWIPE_DELAY_MS = 480;
const matchHome = demoHomes.find((home) => home.id === DEMO_MATCH_ID)!;
const incomingShare = typeof window === "undefined" ? null : readDemoShare(window.location.search);

function DemoPhoto({ home, photo = demoGallery(home)[0], className = "" }: { home: DemoHome; photo?: DemoPhotoRef; className?: string }) {
  return (
    <div
      className={`demo-photo demo-photo--tile-${photo.tile} ${className}`}
      role="img"
      aria-label={`${photo.room} at ${home.street}`}
      style={{ backgroundImage: `url(${photo.src})` }}
    />
  );
}

export default function DemoApp() {
  useFont(FONT);
  useNoIndex();
  const [tab, setTab] = useState<Tab>(incomingShare ? "saved" : "style");
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [saved, setSaved] = useState<string[]>(incomingShare?.ids ?? []);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareName, setShareName] = useState("Alex");
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [browseRatings, setBrowseRatings] = useState<Record<string, Decision>>({});
  const [photoIndices, setPhotoIndices] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<DemoHome | null>(null);
  const [celebration, setCelebration] = useState(false);
  const [sort, setSort] = useState<"taste" | "price">("taste");
  const [drag, setDrag] = useState(0);
  const [exiting, setExiting] = useState<{ id: string; choice: Decision; distance: number } | null>(null);
  const exitTimer = useRef<number | null>(null);
  const exitPending = useRef(false);
  const pointer = useRef<{ x: number; dx: number; active: boolean }>({ x: 0, dx: 0, active: false });
  const galleryTouch = useRef<{ id: string; x: number } | null>(null);
  const lastGallerySwipe = useRef(0);

  useEffect(() => {
    document.documentElement.classList.add("demo-page");
    return () => {
      document.documentElement.classList.remove("demo-page");
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, []);

  const showMatch = Object.keys(decisions).length >= 3;
  const matchOffer = shouldOfferDemoMatch(decisions);
  const current = matchOffer ? matchHome : demoStyleHomes.find((home) => !decisions[home.id]);
  const next = current ? nextDemoStyleHome(decisions, current) : undefined;
  const liked = demoHomes.filter((home) => decisions[home.id] === "like");
  const passed = demoHomes.filter((home) => decisions[home.id] === "pass");
  const hasTaste = liked.length >= 2;
  const strongRead = liked.length >= 5 && passed.length >= 4;
  const hasFeaturedMatch = showMatch && decisions[DEMO_MATCH_ID] !== "pass";
  const tasteLabel = strongRead ? "A strong read on your taste" : hasTaste ? "Getting a feel for your taste" : "Learning your taste";
  const tasteStyle = hasTaste ? "Light-filled character" : null;

  const browse = orderDemoBrowse(liked, sort, hasFeaturedMatch);
  const shareUrl = typeof window === "undefined" ? "" : demoShareUrl(window.location.origin, saved, shareName);

  const decide = useCallback((home: DemoHome, choice: Decision) => {
    const celebrate = matchOffer && home.id === DEMO_MATCH_ID && choice === "like";
    if (tab !== "style" || current?.id !== home.id || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDecisions((before) => ({ ...before, [home.id]: choice }));
      if (celebrate) setCelebration(true);
      setDrag(0);
      return;
    }
    if (exitPending.current) return;
    exitPending.current = true;
    const distance = choice === "skip" ? 0 : (choice === "like" ? 1 : -1) * Math.max(window.innerWidth, 500);
    setExiting({ id: home.id, choice, distance });
    exitTimer.current = window.setTimeout(() => {
      setDecisions((before) => ({ ...before, [home.id]: choice }));
      if (celebrate) setCelebration(true);
      setExiting(null);
      setDrag(0);
      exitPending.current = false;
      exitTimer.current = null;
    }, SWIPE_DELAY_MS);
  }, [current, matchOffer, tab]);

  function shiftPhoto(home: DemoHome, delta: number) {
    setPhotoIndices((before) => ({ ...before, [home.id]: ((before[home.id] ?? 0) + delta + demoGallery(home).length) % demoGallery(home).length }));
  }

  function toggleSave(id: string) {
    setSaved((before) => before.includes(id) ? before.filter((item) => item !== id) : [...before, id]);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setSelected(null); setCelebration(false); setShareOpen(false); return; }
      if (selected || celebration || shareOpen || tab !== "style" || !current) return;
      if (event.key === "ArrowLeft") decide(current, "pass");
      if (event.key === "ArrowRight") decide(current, "like");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, selected, celebration, shareOpen, tab, decide]);

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
    setBrowseRatings({});
    setCelebration(false);
    setSelected(null);
    setDrag(0);
    setTab("style");
  }

  function homeCard(home: DemoHome) {
    const priceDrop = demoPriceDrop(home);
    const photos = demoGallery(home);
    const photoIndex = photoIndices[home.id] ?? 0;
    const choice = browseRatings[`${home.id}:${photoIndex}`];
    return (
      <article className="demo-listing" key={home.id}>
        <div className="demo-listing__photo-wrap">
          <button className="demo-listing__photo-button" onClick={() => { if (Date.now() - lastGallerySwipe.current > 400) setSelected(home); }} onTouchStart={(event) => { galleryTouch.current = { id: home.id, x: event.touches[0].clientX }; }} onTouchEnd={(event) => { if (galleryTouch.current?.id !== home.id) return; const distance = event.changedTouches[0].clientX - galleryTouch.current.x; if (Math.abs(distance) > 40 && photos.length > 1) { shiftPhoto(home, distance < 0 ? 1 : -1); lastGallerySwipe.current = Date.now(); } galleryTouch.current = null; }} aria-label={`Preview ${home.street}, photo ${photoIndex + 1} of ${photos.length}`}>
            <DemoPhoto home={home} photo={photos[photoIndex]} />
          </button>
          <span className="demo-listing__agency">{home.agency}</span>
          {hasFeaturedMatch && sort === "taste" && home.id === DEMO_MATCH_ID && <span className="demo-listing__match">Nearer your taste</span>}
          {home.is_new && <span className="demo-listing__new">New</span>}
          {photos.length > 1 && <><button className="demo-listing__arrow demo-listing__arrow--prev" onClick={() => shiftPhoto(home, -1)} aria-label={`Previous photo of ${home.street}`}>‹</button><button className="demo-listing__arrow demo-listing__arrow--next" onClick={() => shiftPhoto(home, 1)} aria-label={`Next photo of ${home.street}`}>›</button><span className="demo-listing__photo-count">{photoIndex + 1}/{photos.length}</span></>}
          <div className="demo-listing__rate">
            <button className={choice === "pass" ? "is-on" : ""} onClick={() => setBrowseRatings((before) => ({ ...before, [`${home.id}:${photoIndex}`]: "pass" }))} aria-label={`Not my style: ${photos[photoIndex].room} at ${home.street}`} aria-pressed={choice === "pass"}>×</button>
            <button className={choice === "like" ? "is-on" : ""} onClick={() => setBrowseRatings((before) => ({ ...before, [`${home.id}:${photoIndex}`]: "like" }))} aria-label={`Like ${photos[photoIndex].room} at ${home.street}`} aria-pressed={choice === "like"}>♥</button>
          </div>
        </div>
        <div className="demo-listing__body">
          <div className="demo-listing__headline">
            <strong>{demoPrice(home.price_pcm)} <small>pcm</small></strong>
            <button className={`demo-save${saved.includes(home.id) ? " demo-save--on" : ""}`} onClick={() => toggleSave(home.id)} aria-pressed={saved.includes(home.id)}>{saved.includes(home.id) ? "★ Saved" : "☆ Save"}</button>
          </div>
          {priceDrop > 0 && <p className="demo-listing__drop"><s>{demoPrice(Number(home.price_history![0][1]))}</s> Price dropped {demoPrice(priceDrop)}</p>}
          <button className="demo-listing__detail" onClick={() => setSelected(home)}>
            <span>{home.street}, {home.area} {home.postcode}</span>
            <small>{home.bedrooms === 0 ? "Studio" : `${home.bedrooms} bed`} · {home.bathrooms} bath · Preview home ↗</small>
          </button>
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
            {next && <div className="demo-style__underlay" aria-hidden="true"><DemoPhoto home={next} /><div className="demo-style__photo-note">Photo {Object.keys(decisions).length + 2} / {demoHomes.length}</div></div>}
            <div className={`demo-style__moving${exiting ? " demo-style__moving--exiting" : pointer.current.active ? " demo-style__moving--dragging" : ""}`} style={{ transform: `translateX(${exiting?.distance ?? drag}px) rotate(${(exiting?.distance ?? drag) / 25}deg)`, opacity: exiting?.choice === "skip" ? 0 : 1 }}>
              <DemoPhoto home={current} />
              <div className="demo-style__photo-note">Photo {Object.keys(decisions).length + 1} / {demoHomes.length}</div>
              {(Math.abs(drag) > 25 || (exiting && exiting.choice !== "skip")) && <span className={`demo-style__stamp ${(exiting?.choice === "like" || (!exiting && drag > 0)) ? "demo-style__stamp--like" : "demo-style__stamp--pass"}`}>{exiting?.choice === "like" || (!exiting && drag > 0) ? "LIKE" : "PASS"}</span>}
            </div>
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
        <div className="demo-browse__top"><div><p className="demo-kicker">BROWSE HOMES</p><h1>{demoHomes.length} <em>homes</em></h1></div><button className="demo-sort" onClick={() => setSort(sort === "taste" ? "price" : "taste")}>{sort === "taste" && hasFeaturedMatch ? "Nearer your taste" : "Price"} ↓</button></div>
        <div className="demo-browse__list">{browse.map(homeCard)}</div>
      </section>}

      {tab === "saved" && <section className="demo-browse demo-saved">
        <div className="demo-browse__top"><div><p className="demo-kicker">{incomingShare?.from ? `${incomingShare.from.toUpperCase()}'S SHORTLIST` : "YOUR SHORTLIST"}</p><h1>Short<em>list</em></h1></div><span>{saved.length} saved</span></div>
        {saved.length > 0 && <div className="demo-saved__share-row"><p>Homes worth a second look. Your photo swipes stay private.</p><button onClick={() => { setShareCopied(false); setShareError(null); setShareOpen(true); }}>Share list ↗</button></div>}
        {saved.length ? <div className="demo-browse__list">{demoHomes.filter((home) => saved.includes(home.id)).map(homeCard)}</div> : <div className="demo-empty"><h2>Nothing saved <em>yet.</em></h2><p>Save a home from Browse to see it here.</p><button onClick={() => setTab("browse")}>Browse homes</button></div>}
      </section>}

      {selected && <div className="demo-modal" role="presentation" onClick={() => setSelected(null)}><section className="demo-modal__card" role="dialog" aria-modal="true" aria-label={`Preview ${selected.street}`} onClick={(event) => event.stopPropagation()}><button className="demo-modal__close" onClick={() => setSelected(null)} aria-label="Close preview">×</button><DemoPhoto home={selected} photo={demoGallery(selected)[photoIndices[selected.id] ?? 0]} /><div><p className="demo-kicker">{selected.agency}</p><h2>{selected.street}</h2><p>{selected.area} {selected.postcode} · {selected.bedrooms === 0 ? "Studio" : `${selected.bedrooms} bed`} · {demoPrice(selected.price_pcm)} pcm</p></div></section></div>}
      {celebration && <div className="demo-celebration" role="dialog" aria-modal="true" aria-label="It's a match">
        <div className="demo-celebration__confetti" aria-hidden>{Array.from({ length: 18 }, (_, index) => <span key={index} style={{ left: `${(index * 37) % 100}%`, animationDelay: `${((index * 53) % 100) / 100}s`, background: ["#f77537", "#f4c56f", "#c8dcae"][index % 3] }} />)}</div>
        <div className="demo-celebration__card">
          <p className="demo-kicker">A HOME WE THINK YOU'LL LOVE</p>
          <h2>It's a <em>match!</em></h2>
          <div className="demo-celebration__photo"><DemoPhoto home={matchHome} /></div>
          <strong>{demoPrice(matchHome.price_pcm)} pcm</strong>
          <p className="demo-celebration__drop"><s>{demoPrice(Number(matchHome.price_history![0][1]))}</s> Price dropped {demoPrice(demoPriceDrop(matchHome))}</p>
          <p>{matchHome.street}, {matchHome.area}</p>
          <small>One of the places nearer your taste. Tap Save in Browse to share it with friends.</small>
          <button className="demo-celebration__open" onClick={() => { setCelebration(false); setSort("taste"); setTab("browse"); window.scrollTo(0, 0); }}>See it and more like it →</button>
          <button className="demo-celebration__keep" onClick={() => setCelebration(false)}>Keep swiping</button>
        </div>
      </div>}
      {shareOpen && <div className="demo-share" role="presentation" onClick={() => setShareOpen(false)}>
        <section className="demo-share__panel" role="dialog" aria-modal="true" aria-label="Share this list" onClick={(event) => event.stopPropagation()}>
          <div className="demo-share__header"><h2>Share this <em>list</em></h2><button onClick={() => setShareOpen(false)} aria-label="Close share sheet">×</button></div>
          <p>Send your shortlist to a friend. Only home IDs and your first name travel with the link; your swipes stay here.</p>
          <label htmlFor="demo-share-name">Your first name</label>
          <input id="demo-share-name" maxLength={30} value={shareName} onChange={(event) => { setShareName(event.target.value); setShareCopied(false); }} />
          <a className="demo-share__whatsapp" href={`https://wa.me/?text=${encodeURIComponent(`Look at these homes with me: ${shareUrl}`)}`} target="_blank" rel="noopener noreferrer">Send on WhatsApp ↗</a>
          <button className="demo-share__copy" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); setShareCopied(true); setShareError(null); } catch { setShareError("Couldn't copy the link. Check browser permissions."); } }}>{shareCopied ? "Link copied ✓" : "Copy link"}</button>
          {shareError && <p className="demo-share__error" role="alert">{shareError}</p>}
        </section>
      </div>}
      <p className="demo-visually-hidden">This is a simulated demo. All homes, prices and agency names shown here are fictional.</p>
    </main>
  );
}
