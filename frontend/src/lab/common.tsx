import { useEffect, type ImgHTMLAttributes } from "react";
import { normalizeImageUrl } from "../lib/url";

/** loads a Google font for one design only (the real app's fonts stay as they are) */
export function useFont(family: string) {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${family}&display=swap`;
    document.head.appendChild(link);
    return () => link.remove();
  }, [family]);
}

/** the experiments are for sharing by link, not for search engines */
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

export function Photo({ url, ...rest }: { url: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, "src">) {
  return <img referrerPolicy="no-referrer" draggable={false} {...rest} src={normalizeImageUrl(url) ?? undefined} />;
}

export function Loading({ what }: { what: string }) {
  return <p className="lab-loading">{what}</p>;
}

/** a direction in photo space for some words: their text embeddings, measured from the average word */
export function wordsPref(labels: { label: string; embedding: number[] }[], picked: string[]): Float32Array | null {
  if (picked.length === 0 || labels.length === 0) return null;
  const dim = labels[0].embedding.length;
  const mean = new Float32Array(dim);
  for (const l of labels) for (let i = 0; i < dim; i++) mean[i] += l.embedding[i] / labels.length;
  const out = new Float32Array(dim);
  for (const l of labels) if (picked.includes(l.label)) for (let i = 0; i < dim; i++) out[i] += l.embedding[i] - mean[i];
  return out;
}

/** "3 liked, 2 passed" plus the model's own read of how well it knows the person */
export function TasteBar({ lab }: { lab: { tasteRead: { label: string; score: number } | null; likedCount: number; dislikedCount: number; rankingReady: boolean } }) {
  return (
    <div className="taste" role="status">
      <span>{lab.rankingReady ? `${lab.likedCount} liked, ${lab.dislikedCount} passed` : "Loading photo data, rating starts in a moment"}</span>
      <i style={{ ["--s" as string]: `${Math.round((lab.tasteRead?.score ?? 0) * 100)}%` }} />
      <b>{lab.tasteRead?.label ?? "No read yet"}</b>
    </div>
  );
}

export function RateButtons({ onLike, onPass, disabled, liked }: { onLike: () => void; onPass: () => void; disabled?: boolean; liked?: boolean }) {
  return (
    <div className="rate">
      <button className="rate__pass" onClick={onPass} disabled={disabled} aria-label="Not for me">
        ✕
      </button>
      <button className={`rate__like${liked ? " on" : ""}`} onClick={onLike} disabled={disabled} aria-label="I like this" aria-pressed={liked}>
        ♥
      </button>
    </div>
  );
}
