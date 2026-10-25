import { useEffect } from "react";
import { setPageMeta } from "./lib/seo";

export default function NotFoundPage() {
  useEffect(() => {
    setPageMeta({ title: "Page not found: House Swipe", description: "This page does not exist.", noindex: true });
  }, []);
  return (
    <main style={{ maxWidth: "30rem", margin: "0 auto", padding: "4rem 1.5rem", fontFamily: "Georgia, serif", color: "#15120f", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: "2rem", margin: "0 0 .75rem" }}>That page isn&rsquo;t here</h1>
      <p>The address you opened doesn&rsquo;t exist on House Swipe.</p>
      <p><a href="/" style={{ color: "#15120f" }}>Go to House Swipe</a></p>
    </main>
  );
}
