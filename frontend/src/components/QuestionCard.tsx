import { useState } from "react";
import type { LatLon } from "../lib/geo";
import { BEDROOM_OPTIONS, BUDGET_OPTIONS, type QuestionId } from "../lib/questions";
import { DrawMap, type MapPoint } from "./DrawMap";

interface Props {
  id: QuestionId;
  mapPoints: MapPoint[];
  /** called only on "Continue swiping", so skipping never leaves a half-applied filter behind */
  onBedrooms: (value: string) => void;
  onBudget: (value: string) => void;
  onShapes: (shapes: LatLon[][]) => void;
  onSkip: () => void;
}

const QUESTIONS: Record<QuestionId, { title: string; hint: string }> = {
  bedrooms: { title: "How many bedrooms do you need?", hint: "We'll show homes with at least this many." },
  budget: { title: "What's your monthly budget?", hint: "The most you'd like to pay per month." },
  location: { title: "Where would you like to live?", hint: "Draw a circle around the area you like on the map." },
};

/** A practical question shown between photos. It only sets the normal Browse filters. */
export function QuestionCard(p: Props) {
  const q = QUESTIONS[p.id];
  // nothing is pre-selected: the person has to choose, so "Continue" can never record a guess
  const [bedrooms, setBedrooms] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<LatLon[][]>([]);
  const value = (list: ReadonlyArray<{ label: string; value: string }>, label: string | null) =>
    list.find((o) => o.label === label)?.value ?? "";

  const ready = p.id === "bedrooms" ? bedrooms !== null : p.id === "budget" ? budget !== null : drawn.length > 0;

  function choose() {
    if (!ready) return;
    if (p.id === "bedrooms") p.onBedrooms(value(BEDROOM_OPTIONS, bedrooms));
    else if (p.id === "budget") p.onBudget(value(BUDGET_OPTIONS, budget));
    else p.onShapes(drawn);
  }

  return (
    <div className="question" role="group" aria-label={q.title}>
      <p className="question__label">Personalise your search</p>
      <h2 className="question__title">{q.title}</h2>
      <p className="question__hint">{q.hint}</p>

      {p.id === "bedrooms" && (
        <div className="question__options">
          {BEDROOM_OPTIONS.map((o) => (
            <button
              key={o.label}
              className={`question__opt ${bedrooms === o.label ? "question__opt--on" : ""}`}
              onClick={() => setBedrooms(o.label)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {p.id === "budget" && (
        <div className="question__options">
          {BUDGET_OPTIONS.map((o) => (
            <button
              key={o.label}
              className={`question__opt ${budget === o.label ? "question__opt--on" : ""}`}
              onClick={() => setBudget(o.label)}
            >
              {o.label === "No limit" ? o.label : `Up to ${o.label}`}
            </button>
          ))}
        </div>
      )}

      {p.id === "location" && (
        <div className="question__map">
          <DrawMap points={p.mapPoints} shapes={drawn} drawing onShape={(ring) => setDrawn((cur) => [...cur, ring])} />
          {drawn.length > 0 && (
            <button className="question__clean" onClick={() => setDrawn([])}>
              Clean
            </button>
          )}
        </div>
      )}

      <button className="question__continue" disabled={!ready} onClick={choose}>
        Continue swiping
      </button>
      <button className="question__skip" onClick={p.onSkip}>
        Skip for now
      </button>
    </div>
  );
}
