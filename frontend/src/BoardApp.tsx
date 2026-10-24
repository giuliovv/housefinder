import { useLayoutEffect } from "react";
import App from "./App";
import { DeckVariantContext } from "./components/deckVariant";
import { useFont } from "./lab/common";
import "./lab/rd-board.css";

const BOARD_FONT = "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Instrument+Serif:ital@1&family=DM+Mono:wght@500";

export default function BoardApp() {
  useFont(BOARD_FONT);
  useLayoutEffect(() => {
    document.documentElement.classList.add("rd-board");
    return () => document.documentElement.classList.remove("rd-board");
  }, []);

  return (
    <DeckVariantContext.Provider value="board">
      <App labVariant="board" />
    </DeckVariantContext.Provider>
  );
}
