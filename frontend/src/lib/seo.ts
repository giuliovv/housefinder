/** Per-page head tags for the client-rendered routes: every page shares index.html, so the ones that need their own title,
 * description or canonical set them here (search engines that run scripts read the result). */
export function setPageMeta({ title, description, canonical, noindex = false }: { title: string; description?: string; canonical?: string; noindex?: boolean }) {
  document.title = title;
  const set = (selector: string, make: () => HTMLElement, attr: string, value: string) => {
    let el = document.head.querySelector<HTMLElement>(selector);
    if (!el) {
      el = make();
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  };
  if (description) set('meta[name="description"]', () => Object.assign(document.createElement("meta"), { name: "description" }), "content", description);
  if (canonical) set('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" }), "href", canonical);
  if (noindex) set('meta[name="robots"]', () => Object.assign(document.createElement("meta"), { name: "robots" }), "content", "noindex");
}
