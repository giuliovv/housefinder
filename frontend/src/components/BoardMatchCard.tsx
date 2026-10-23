import type { Listing } from "../types";
import { gbp } from "../lib/priceHistory";
import { normalizeImageUrl } from "../lib/url";
import { trackMilestone } from "../lib/stats";

export function BoardMatchCard({ listing, photoUrl, onLike, onPass }: {
  listing: Listing;
  photoUrl: string;
  onLike: () => void;
  onPass: () => void;
}) {
  const { summary } = listing;
  return (
    <article className="board-match">
      <div className="board-match__photo">
        <img src={normalizeImageUrl(photoUrl) ?? undefined} alt={summary.address} referrerPolicy="no-referrer" />
        <span>Likely match</span>
      </div>
      <div className="board-match__body">
        <h2>Looks nearer <em>your</em> taste</h2>
        <p>A relative ranking from the photos, not a prediction. You decide.</p>
        <div className="board-match__facts">
          <strong>{summary.price_pcm == null ? "Price on request" : gbp(summary.price_pcm)}</strong>
          <span>{summary.bedrooms == null ? "Bedrooms not listed" : summary.bedrooms === 0 ? "Studio" : `${summary.bedrooms} bed`} · {summary.address}</span>
        </div>
        <div className="board-match__actions">
          <button onClick={onPass}>Not for me</button>
          <button onClick={onLike}>Like it</button>
        </div>
      </div>
      <a href={summary.url} target="_blank" rel="noopener noreferrer" onClick={() => trackMilestone("m_agency_click")}>View on {listing.agency_name} ↗</a>
    </article>
  );
}
