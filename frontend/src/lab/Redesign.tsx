import { useEffect } from "react";
import App from "../App";
import { useFont } from "./common";
import "./redesign.css";

/** The whole real app, every feature, wearing a different design: a re-skin through colour variables plus layout rules. */
export default function Redesign() {
  useFont("family=Schibsted+Grotesk:wght@400;500;600;700;800");
  useEffect(() => {
    document.documentElement.classList.add("rd-on");
    return () => document.documentElement.classList.remove("rd-on");
  }, []);
  return (
    <>
      <a className="rd-back" href="/ui">
        All designs
      </a>
      <App />
    </>
  );
}
