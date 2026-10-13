import { describe, expect, it } from "vitest";
import { normalizeImageUrl } from "./url";

describe("normalizeImageUrl", () => {
  it("makes protocol-relative urls explicit", () => {
    expect(normalizeImageUrl("//mr1.homeflow-assets.co.uk/x.jpg")).toBe("https://mr1.homeflow-assets.co.uk/x.jpg");
    expect(normalizeImageUrl(null)).toBeNull();
  });
  it("gives hotlink-protected hosts a fresh cache entry, once", () => {
    const u = "https://rlmorrisproperty.co.uk/wp-content/uploads/2021/06/a.jpg";
    expect(normalizeImageUrl(u)).toBe(`${u}?nr=1`);
    expect(normalizeImageUrl(`${u}?nr=1`)).toBe(`${u}?nr=1`);
    expect(normalizeImageUrl("https://other.test/a.jpg")).toBe("https://other.test/a.jpg");
  });
});
