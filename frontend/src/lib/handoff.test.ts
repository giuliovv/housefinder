import { describe, expect, it } from "vitest";
import { apply, collect, decode, encode, MAX_PAYLOAD_CHARS, type KeyValueStore } from "./handoff";

function memStore(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get length() {
      return Object.keys(data).length;
    },
    key: (i) => Object.keys(data)[i] ?? null,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => void (data[k] = v),
  };
}

const swipe = (c: string, n = 600) => ({ c, v: "A".repeat(n), s: 0.01 });

describe("handoff", () => {
  it("collects only House Swipe keys and skips the per-visit one", () => {
    const s = memStore({ "housefinder:saved:v1": "[]", "housefinder:new-since:v1": "2026-10-10", "other:key": "x" });
    expect(Object.keys(collect(s))).toEqual(["housefinder:saved:v1"]);
  });

  it("round-trips through the URL fragment", () => {
    const entries = { "housefinder:me:v1": JSON.stringify({ id: "abc", name: "Zoë ✓" }), "housefinder:saved:v1": '["a:1"]' };
    expect(decode("#migrate=" + encode(entries))).toEqual(entries);
  });

  it("ignores anything that isn't a payload", () => {
    expect(decode("")).toBeNull();
    expect(decode("#migrate=not-base64!!")).toBeNull();
    expect(decode("#other=1")).toBeNull();
  });

  it("shrinks an oversized payload by dropping the oldest swipes' vectors, never the swipes", () => {
    const swipes: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) swipes[`p:${i}::url`] = swipe(i % 2 ? "like" : "dislike");
    const payload = encode({ "housefinder:style-swipes:v2": JSON.stringify(swipes) });
    expect(payload.length).toBeLessThanOrEqual(MAX_PAYLOAD_CHARS);
    const back = JSON.parse(decode("#migrate=" + payload)!["housefinder:style-swipes:v2"]);
    expect(Object.keys(back)).toHaveLength(200);
    expect(back["p:0::url"].v).toBe(""); // oldest lost its vector
    expect(back["p:199::url"].v).not.toBe(""); // newest kept
  });

  it("merges swipes and saved homes without overwriting what is already there", () => {
    const store = memStore({
      "housefinder:style-swipes:v2": JSON.stringify({ "p:1::u": swipe("like") }),
      "housefinder:saved:v1": '["x:1"]',
      "housefinder:me:v1": '{"id":"new","name":"New"}',
    });
    apply(
      {
        "housefinder:style-swipes:v2": JSON.stringify({ "p:1::u": swipe("dislike"), "p:2::u": swipe("like"), "p:3::u": { c: "like", v: "", s: 0 } }),
        "housefinder:saved:v1": '["x:1","x:2"]',
        "housefinder:me:v1": '{"id":"old","name":"Old"}',
        "housefinder:filters:v1": '{"minPrice":"1000"}',
      },
      store,
    );
    const swipes = JSON.parse(store.data["housefinder:style-swipes:v2"]);
    expect(swipes["p:1::u"].c).toBe("like"); // the swipe already made here wins
    expect(swipes["p:2::u"].c).toBe("like");
    expect("p:3::u" in swipes).toBe(false); // no vector: queued to be re-derived instead
    expect(JSON.parse(store.data["housefinder:style-swipes:v1"])).toEqual({ "p:3::u": "like" });
    expect(JSON.parse(store.data["housefinder:saved:v1"])).toEqual(["x:1", "x:2"]);
    expect(store.data["housefinder:me:v1"]).toBe('{"id":"new","name":"New"}');
    expect(store.data["housefinder:filters:v1"]).toBe('{"minPrice":"1000"}');
  });
});
