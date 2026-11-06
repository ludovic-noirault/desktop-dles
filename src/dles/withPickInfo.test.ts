import { describe, expect, it } from "vitest";
import type { StoredPick } from "../storage/pickRepo";
import type { GameInfo } from "./catalog";
import { gameUrlKey } from "./catalog";
import { withPickInfo } from "./pick";

const pick: StoredPick = {
  slug: "wordle",
  name: "Wordle",
  url: "https://example.com/wordle",
  category: "Words",
  synopsis: "Guess the word.",
  day: "2026-11-06",
  status: "shown",
};

describe("withPickInfo", () => {
  it("adds the pick info under its URL key", () => {
    const key = gameUrlKey(pick.url) as string;
    const result = withPickInfo(new Map(), pick);
    expect(result.get(key)).toEqual({
      synopsis: "Guess the word.",
      category: "Words",
    });
  });

  it("returns the map unchanged without a pick or a synopsis", () => {
    const info = new Map<string, GameInfo>();
    expect(withPickInfo(info, null)).toBe(info);
    expect(withPickInfo(info, { ...pick, synopsis: null })).toBe(info);
  });

  it("does not mutate the input map", () => {
    const info = new Map<string, GameInfo>();
    const result = withPickInfo(info, pick);
    expect(result).not.toBe(info);
    expect(info.size).toBe(0);
  });
});
