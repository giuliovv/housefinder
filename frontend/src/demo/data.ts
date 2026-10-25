import manifest from "../../../design/demo/manifest.json";

export type DemoHome = (typeof manifest.homes)[number] & { sheet: number; tile: number };

export const DEMO_MATCH_ID = "h05";

export function shouldOfferDemoMatch(decisions: Record<string, string>): boolean {
  return Object.keys(decisions).length >= 3 && !decisions[DEMO_MATCH_ID];
}

export const demoHomes: DemoHome[] = manifest.homes.map((home, index) => ({
  ...home,
  sheet: Math.floor(index / 4) + 1,
  tile: index % 4,
}));

// Keep the Browse catalogue order separate from the filming swipe sequence.
const earlyStyleOrder = [0, 16, 1, 2, 17, 3, 4, 18, 5, 6, 19];
export const demoStyleHomes: DemoHome[] = [
  ...earlyStyleOrder.map((index) => demoHomes[index]),
  ...demoHomes.filter((_, index) => !earlyStyleOrder.includes(index)),
];

export function nextDemoStyleHome(decisions: Record<string, string>, current: DemoHome): DemoHome | undefined {
  if (Object.keys(decisions).length + 1 >= 3 && current.id !== DEMO_MATCH_ID && !decisions[DEMO_MATCH_ID]) {
    return demoHomes.find((home) => home.id === DEMO_MATCH_ID);
  }
  return demoStyleHomes.find((home) => home.id !== current.id && !decisions[home.id]);
}

export interface DemoPhotoRef {
  src: string;
  tile: number;
  room: string;
}

export function demoGallery(home: DemoHome): DemoPhotoRef[] {
  const cover = { src: `/demo/img/sheet-${home.sheet}.webp`, tile: home.tile, room: "Living room" };
  const rooms = home.id === DEMO_MATCH_ID ? ["Bedroom", "Kitchen", "Dining room"]
    : home.id === "h01" ? ["Bedroom", "Kitchen", "Bathroom", "Dining room"] : [];
  if (rooms.length === 0) return [cover];
  const src = `/demo/img/${home.id}-rooms.webp`;
  const tiles = home.id === DEMO_MATCH_ID ? [0, 1, 3] : [0, 1, 2, 3];
  return [cover, ...rooms.map((room, index) => ({ src, tile: tiles[index], room }))];
}

export function demoPrice(price: number): string {
  return `£${price.toLocaleString("en-GB")}`;
}

export function demoPriceDrop(home: DemoHome): number {
  if (!home.price_history || home.price_history.length < 2) return 0;
  return Math.max(0, Number(home.price_history[0][1]) - Number(home.price_history.at(-1)![1]));
}

export function demoShareUrl(origin: string, ids: string[], firstName: string): string {
  const url = new URL("/demo", origin);
  url.searchParams.set("shared", ids.filter((id) => demoHomes.some((home) => home.id === id)).join(","));
  if (firstName.trim()) url.searchParams.set("from", firstName.trim().slice(0, 30));
  return url.toString();
}

export function readDemoShare(search: string): { ids: string[]; from: string } | null {
  const params = new URLSearchParams(search);
  const shared = params.get("shared");
  if (shared === null) return null;
  const allowed = new Set(demoHomes.map((home) => home.id));
  const ids = [...new Set(shared.split(",").filter((id) => allowed.has(id)))];
  return ids.length ? { ids, from: (params.get("from") ?? "").slice(0, 30) } : null;
}

export function demoMatchScore(home: DemoHome, liked: DemoHome[]): number {
  if (liked.length === 0) return 0;
  const sameStyle = liked.filter((other) => other.style === home.style).length;
  const sameSheet = liked.filter((other) => other.sheet === home.sheet).length;
  return sameStyle * 2 + sameSheet;
}

export function orderDemoBrowse(liked: DemoHome[], sort: "taste" | "price", featured: boolean): DemoHome[] {
  return [...demoHomes].sort((a, b) => {
    if (a.sheet === 5 || b.sheet === 5) return Number(a.sheet === 5) - Number(b.sheet === 5);
    if (sort === "taste" && featured) {
      if (a.id === DEMO_MATCH_ID) return -1;
      if (b.id === DEMO_MATCH_ID) return 1;
      if (a.id === "h01") return -1;
      if (b.id === "h01") return 1;
    }
    if (sort === "taste" && liked.length >= 2) {
      const difference = demoMatchScore(b, liked) - demoMatchScore(a, liked);
      if (difference) return difference;
    }
    return a.price_pcm - b.price_pcm;
  });
}
