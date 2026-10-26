import { normalizeImageUrl } from "../lib/url";

/**
 * The first "listing" in Browse until there is a good read on someone's taste: it looks like a card in the list but is an
 * invitation to go back and swipe, because without a taste the list below is only sorted by price.
 */
export function TastePromptCard({ rated, photos, onSwipe }: { rated: number; photos: string[]; onSwipe: () => void }) {
  return (
    <section className="taste-prompt" aria-label="Your matches are not ready yet">
      <div className="taste-prompt__photos" aria-hidden="true">
        {photos.slice(0, 3).map((url) => (
          <img key={url} src={normalizeImageUrl(url) ?? undefined} alt="" referrerPolicy="no-referrer" draggable={false} />
        ))}
        <span className="taste-prompt__tag">Not sorted for you yet</span>
      </div>
      <div className="taste-prompt__body">
        <h2>Your matches aren&rsquo;t ready</h2>
        <p>
          {rated === 0 ? "Swipe a few photos" : `You've rated ${rated} ${rated === 1 ? "photo" : "photos"}. Swipe a few more`} and the homes closest to your taste will move to the top of this list. Until then it is sorted by price.
        </p>
        <button type="button" onClick={onSwipe}>{rated === 0 ? "Swipe a few photos" : "Swipe a few more photos"}</button>
      </div>
    </section>
  );
}
