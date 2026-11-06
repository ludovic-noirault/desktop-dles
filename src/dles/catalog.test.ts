import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { gameUrlKey, parseCatalog, parseGamePage } from "./catalog";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const push = (text: string) =>
  `<script>self.__next_f.push(${JSON.stringify([1, text])})</script>`;

test("gameUrlKey ignores www, trailing index.html, query and fragment", () => {
  expect(gameUrlKey("https://www.nytimes.com/games/wordle")).toBe(
    "nytimes.com/games/wordle",
  );
  expect(
    gameUrlKey("https://www.nytimes.com/games/wordle/index.html?ref=dles.gg#x"),
  ).toBe("nytimes.com/games/wordle");
});

test("gameUrlKey lower-cases the host and drops a trailing slash", () => {
  expect(gameUrlKey("https://Scrandle.net/")).toBe("scrandle.net");
  expect(gameUrlKey("https://scrandle.net")).toBe("scrandle.net");
});

test("gameUrlKey tells two paths apart", () => {
  expect(gameUrlKey("https://a.com/x")).not.toBe(gameUrlKey("https://a.com/y"));
});

test("gameUrlKey rejects non-https and invalid input", () => {
  expect(gameUrlKey("http://a.com")).toBeNull();
  expect(gameUrlKey("not a url")).toBeNull();
});

test("parses the catalog across pushes", () => {
  expect(parseCatalog(fixture("home.html"))).toEqual([
    {
      slug: "wordle",
      name: "Wordle",
      url: "https://www.nytimes.com/games/wordle/index.html",
    },
    { slug: "globle", name: "Globle", url: "https://globle-game.com/game" },
  ]);
});

test("returns an empty catalog when allGames is missing or broken", () => {
  expect(parseCatalog("<html></html>")).toEqual([]);
  expect(parseCatalog(push('x"allGames":[{"name":'))).toEqual([]);
});

test("skips entries with a bad slug or a missing field", () => {
  const games = [
    { id: 1, name: "A", url: "https://a.example/", slug: "a" },
    { id: 2, name: "B", url: "https://b.example/", slug: "Bad Slug" },
    { id: 3, url: "https://c.example/", slug: "c" },
    { id: 4, name: "D", url: "https://d.example/", slug: "d" },
  ];
  const html = push(`{"allGames":${JSON.stringify(games)}}`);
  expect(parseCatalog(html).map((g) => g.slug)).toEqual(["a", "d"]);
});

test("reads synopsis and genre from JSON-LD", () => {
  expect(parseGamePage(fixture("game-wordle.html"))).toEqual({
    synopsis:
      "Guess a 5-letter word in 6 tries. Each guess reveals which letters are correct, in the word but misplaced, or absent.",
    category: "Words",
  });
});

test("decodes entities in the meta description", () => {
  expect(parseGamePage(fixture("game-meta-only.html"))).toEqual({
    synopsis: "Pick the fan's favourite & win",
    category: null,
  });
});

test("returns nulls for an unknown page", () => {
  expect(parseGamePage("<html></html>")).toEqual({
    synopsis: null,
    category: null,
  });
});
