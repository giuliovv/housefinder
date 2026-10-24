import { useState } from "react";
import { useFont } from "./lab/common";
import { setUsageStatsEnabled, usageStatsEnabled } from "./lib/stats";
import "./privacy.css";

const BOARD_FONT = "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Instrument+Serif:ital@1&family=DM+Mono:wght@500";

export default function PrivacyPage() {
  useFont(BOARD_FONT);
  const [statsEnabled, setStatsEnabled] = useState(usageStatsEnabled);

  function updateStats(enabled: boolean) {
    setUsageStatsEnabled(enabled);
    setStatsEnabled(usageStatsEnabled());
  }

  return (
    <main className="privacy">
      <header className="privacy__header">
        <a href="/" className="privacy__back">← Back to homes</a>
        <span>House Swipe / London rentals</span>
      </header>

      <div className="privacy__body">
        <p className="privacy__eyebrow">The straightforward version</p>
        <h1>Privacy, <em>plainly.</em></h1>
        <p className="privacy__lead">Your taste and filters stay in this browser. Sharing a shortlist is optional. We count broad usage, not your individual browsing history.</p>
        <p className="privacy__updated">Last updated 24 October 2026</p>

        <section>
          <h2>Who runs this</h2>
          <p>House Swipe is the name of this service. For privacy questions or requests, email <a href="mailto:hello@houseswipe.uk">hello@houseswipe.uk</a>.</p>
        </section>

        <section>
          <h2>What stays on your device</h2>
          <p>We use your browser's local and session storage to remember swipes, taste preferences, filters, hidden photos, saved homes, your first name if you share a list, and when you last visited. This makes the app work without an account. We do not upload your taste profile or individual swipes to our servers. Clearing this site's browser data removes these local choices.</p>
          <p>We do not deliberately set browser cookies. Browser storage is still a form of device storage, even though it is not a cookie.</p>
        </section>

        <section>
          <h2>Shared shortlists</h2>
          <p>If you create or join a shared shortlist, we store its saved-home IDs, listing snapshots (address, price, image and agency link), and the first names and random participant IDs of people who saved them in Google Firebase Firestore. Anyone with the long, unguessable share link can see and change that list. Do not put sensitive information in a first name.</p>
          <p>Shared lists have <strong>no automatic expiry</strong> today. Leaving removes your saved entries and first name from the shared list, but keeps your private saves in this browser. The creator of a new list can delete it for everyone using a private management key; losing that key means we may need to help. Older lists have no owner key, so email us with the share link to request deletion. You can use the app without creating a list.</p>
        </section>

        <section>
          <h2>Usage statistics</h2>
          <p>We add simple daily counters in Firebase Firestore, such as visits, first swipes, saves and clicks to agency listings. We do not send the homes you viewed, your taste profile, your name, or a user ID with these counter updates. This browser stores a small record so the same milestone is counted only once and a visit only once per day. Our aim is to understand which parts of the app work and improve them, not to track individuals. Google receives the network request, which can include technical data such as your IP address.</p>
          <div className="privacy__choice">
            <div>
              <strong>Usage statistics</strong>
              <p>Turn off daily counters for this browser. Your swipes, filters and saved homes will still work.</p>
            </div>
            <button type="button" aria-pressed={!statsEnabled} onClick={() => updateStats(!statsEnabled)}>
              {statsEnabled ? "Turn off" : "Turn on"}
            </button>
          </div>
          <p>If your browser sends Do Not Track, we also skip usage statistics. Turning statistics off clears the local counter record; it cannot undo counters already added to past daily totals.</p>
        </section>

        <section>
          <h2>Other services and links</h2>
          <p>Amazon Web Services serves the site and its data. Google supplies Firebase, web fonts and the optional shared-list service. Listing images may load from the relevant agency or its image host; opening an agency listing takes you to that agency's own website. The optional map loads tiles from OpenStreetMap. These providers receive normal web requests, which can include your IP address and browser details. Their own privacy notices apply when you visit their sites.</p>
        </section>

        <section>
          <h2>Why we use this data</h2>
          <p>We use device storage and shared-list data to provide the features you ask for, and aggregate counters to improve the app. Our UK GDPR basis is our legitimate interests in operating and improving House Swipe; we balance these against your interests by keeping taste on-device, making sharing optional, and letting you turn off statistics. We do not sell personal data or use it for advertising. No account or payment is required.</p>
        </section>

        <section>
          <h2>Retention and your choices</h2>
          <p>Local data remains until you clear this site's browser storage. The app's Reset control clears taste feedback only, not every saved preference. Shared lists remain until their creator deletes them or deletion is requested; there is currently no automatic expiry. A deleted list's contents are removed, while a minimal deletion marker is retained to prevent reuse of its link. Daily statistics are stored as aggregate totals. Our hosting and service providers may retain operational logs under their own retention policies.</p>
          <p>You can ask to access, correct or delete personal data we hold, or object to its processing, by emailing us. You can also complain to the <a href="https://ico.org.uk/make-a-complaint/">UK Information Commissioner's Office</a>. Our providers may process data outside the UK; email us if you want details of where your data goes and the safeguards used. We will update this notice if the service changes materially.</p>
        </section>
      </div>
      <footer className="privacy__footer"><a href="/">Back to House Swipe →</a></footer>
    </main>
  );
}
