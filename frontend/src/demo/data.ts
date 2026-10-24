import manifest from "../../../design/demo/manifest.json";

export type DemoHome = (typeof manifest.homes)[number] & { sheet: number; tile: number };

export const DEMO_MATCH_ID = "h05";

export const demoHomes: DemoHome[] = manifest.homes.map((home, index) => ({
  ...home,
  sheet: Math.floor(index / 4) + 1,
  tile: index % 4,
}));

export function demoPrice(price: number): string {
  return `£${price.toLocaleString("en-GB")}`;
}

export function demoMatchScore(home: DemoHome, liked: DemoHome[]): number {
  if (liked.length === 0) return 0;
  const sameStyle = liked.filter((other) => other.style === home.style).length;
  const sameSheet = liked.filter((other) => other.sheet === home.sheet).length;
  return sameStyle * 2 + sameSheet;
}
