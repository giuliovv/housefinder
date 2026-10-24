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
