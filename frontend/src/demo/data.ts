import manifest from "../../../design/demo/manifest.json";

export type DemoHome = (typeof manifest.homes)[number] & { sheet: number; tile: number };

export const DEMO_MATCH_ID = "h05";

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

export function demoPrice(price: number): string {
  return `£${price.toLocaleString("en-GB")}`;
}

export function demoMatchScore(home: DemoHome, liked: DemoHome[]): number {
  if (liked.length === 0) return 0;
  const sameStyle = liked.filter((other) => other.style === home.style).length;
  const sameSheet = liked.filter((other) => other.sheet === home.sheet).length;
  return sameStyle * 2 + sameSheet;
}
