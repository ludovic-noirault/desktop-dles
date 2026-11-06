import { expect, test } from "vitest";
import {
  buildGamesFile,
  classifyEntries,
  parseGamesFile,
  readGamesFile,
} from "./gamesFile";

const file = (games: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ format: "desktop-dles/games", version: 1, games, ...extra });

test("buildGamesFile writes the format, two-space indent and a trailing newline", () => {
  const text = buildGamesFile([
    { name: "Wordle", url: "https://www.nytimes.com/games/wordle" },
  ]);
  expect(text).toBe(
    '{\n  "format": "desktop-dles/games",\n  "version": 1,\n  "games": [\n    {\n      "name": "Wordle",\n      "url": "https://www.nytimes.com/games/wordle"\n    }\n  ]\n}\n',
  );
});

test("parseGamesFile keeps entries in file order and ignores unknown fields", () => {
  expect(
    parseGamesFile(
      file(
        [
          { name: "B", url: "https://b.example", stars: 5 },
          { name: "A", url: "https://a.example" },
        ],
        { note: "hi" },
      ),
    ),
  ).toEqual({
    ok: true,
    entries: [
      { name: "B", url: "https://b.example" },
      { name: "A", url: "https://a.example" },
    ],
  });
});

test("an entry with a missing or non-string field becomes empty strings, not a file error", () => {
  expect(
    parseGamesFile(file([{ url: "https://a.example" }, { name: "B", url: 3 }])),
  ).toEqual({
    ok: true,
    entries: [
      { name: "", url: "https://a.example" },
      { name: "B", url: "" },
    ],
  });
});

test.each([
  ["not JSON", "hello"],
  ["a JSON array", "[]"],
  ["no format", JSON.stringify({ version: 1, games: [] })],
  ["another format", file([], { format: "other" })],
  ["version as a string", file([], { version: "1" })],
  ["version zero", file([], { version: 0 })],
  ["games not an array", file({})],
])("parseGamesFile refuses %s as notGamesFile", (_, text) => {
  expect(parseGamesFile(text)).toEqual({ ok: false, error: "notGamesFile" });
});

test("a newer version is reported as such", () => {
  expect(parseGamesFile(file([], { version: 2 }))).toEqual({
    ok: false,
    error: "newerVersion",
  });
});

test("a file with no games is noGames", () => {
  expect(parseGamesFile(file([]))).toEqual({ ok: false, error: "noGames" });
});

test("parses a file that starts with a byte order mark", () => {
  expect(
    parseGamesFile(`﻿${file([{ name: "A", url: "https://a.example" }])}`),
  ).toMatchObject({ ok: true });
});

test("readGamesFile refuses a file over 1 MB before parsing", async () => {
  expect(await readGamesFile(new Blob(["x".repeat(1_000_001)]))).toEqual({
    ok: false,
    error: "notGamesFile",
  });
});

test("readGamesFile reads a Blob", async () => {
  expect(
    await readGamesFile(
      new Blob([file([{ name: "A", url: "https://a.example" }])]),
    ),
  ).toEqual({
    ok: true,
    entries: [{ name: "A", url: "https://a.example" }],
  });
});

test("classifyEntries marks new, present and invalid entries, trimmed", () => {
  const current = [{ name: "Scrandle", url: "https://scrandle.net" }];
  expect(
    classifyEntries(
      [
        { name: " Framed ", url: " https://framed.wtf " },
        { name: "Other name", url: "https://scrandle.net/" },
        { name: "Old", url: "http://old.example" },
        { name: "  ", url: "https://noname.example" },
      ],
      current,
    ),
  ).toEqual([
    { name: "Framed", url: "https://framed.wtf", status: "new" },
    { name: "Other name", url: "https://scrandle.net/", status: "present" },
    { name: "Old", url: "http://old.example", status: "invalid" },
    { name: "", url: "https://noname.example", status: "invalid" },
  ]);
});

test("trimmed URL with another host case is present", () => {
  expect(
    classifyEntries(
      [{ name: "S", url: "  https://SCRANDLE.net  " }],
      [{ name: "Scrandle", url: "https://scrandle.net" }],
    )[0].status,
  ).toBe("present");
});

test("a URL repeated in the same file is new once, then present", () => {
  expect(
    classifyEntries(
      [
        { name: "A", url: "https://a.example" },
        { name: "A again", url: "https://a.example/" },
      ],
      [],
    ).map((e) => e.status),
  ).toEqual(["new", "present"]);
});

test("every valid entry is new against an empty list", () => {
  expect(
    classifyEntries(
      [
        { name: "A", url: "https://a.example" },
        { name: "B", url: "https://b.example" },
      ],
      [],
    ).map((e) => e.status),
  ).toEqual(["new", "new"]);
});

test("round trip keeps names and marks every game present", () => {
  const games = [
    { name: 'Café "quiz" 🎯', url: "https://cafe.example/quiz?day=1" },
    { name: "Wordle", url: "https://www.nytimes.com/games/wordle" },
  ];
  const read = parseGamesFile(buildGamesFile(games));
  if (!read.ok) throw new Error("expected ok");
  expect(read.entries).toEqual(games);
  expect(classifyEntries(read.entries, games).map((e) => e.status)).toEqual([
    "present",
    "present",
  ]);
});
