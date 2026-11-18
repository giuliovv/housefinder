/**
 * Tiny A/B assignment. A browser is put in an arm once and keeps it. Browsers that already know the site are left out
 * ("legacy") so the test only measures first-time visitors.
 *
 * Experiment "welcome": `on` shows the welcome screen before the first photo (the current design), `off` goes straight to
 * the first photo with a one-line prompt. Results: the `ab_w*` counters in lib/stats.ts (shown on the /stats page).
 */
import { readJson, writeJson } from "./shortlist";

export type WelcomeArm = "on" | "off" | "legacy";
const KEY = "housefinder:exp:welcome:v1";

/** the arm for this browser, assigned on first call. `known` = it has used the site before (welcome already seen or visited). */
export function welcomeArm(known: boolean, random: () => number = Math.random): WelcomeArm {
  const stored = readJson<WelcomeArm | null>(KEY, null);
  if (stored === "on" || stored === "off" || stored === "legacy") return stored;
  const arm: WelcomeArm = known ? "legacy" : random() < 0.5 ? "on" : "off";
  writeJson(KEY, arm);
  return arm;
}
