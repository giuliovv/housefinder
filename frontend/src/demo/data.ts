import manifest from "../../../design/demo/manifest.json";

export type DemoHome = (typeof manifest.homes)[number] & { sheet: number; tile: number };

const catalogue: DemoHome[] = manifest.homes.map((home, index) => ({
  ...home,
  sheet: Math.floor(index / 4) + 1,
  tile: index % 4,
}));

// Put a few less appealing rooms near the start so the swipe deck invites both choices.
const earlyOrder = [0, 16, 1, 2, 17, 3, 4, 18, 5, 6, 19];
export const demoHomes: DemoHome[] = [
  ...earlyOrder.map((index) => catalogue[index]),
  ...catalogue.filter((_, index) => !earlyOrder.includes(index)),
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
