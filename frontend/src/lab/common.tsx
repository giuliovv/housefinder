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
