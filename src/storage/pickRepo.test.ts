import { beforeEach, expect, test } from "vitest";
import type { Db } from "./db";
import {
  addSkip,
  clearPick,
  getPick,
  listInfo,
  listSkips,
  markPickAdded,
  type StoredPick,
  saveInfo,
  savePick,
} from "./pickRepo";
import { createTestDb } from "./testDb";

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

const pick: StoredPick = {
  day: "2026-11-06",
  slug: "birdle",
  name: "Birdle",
  url: "https://birdle.example/play",
  synopsis: "Guess the bird.",
  category: "Nature",
  status: "shown",
};

test("savePick then getPick round-trips every field", async () => {
  await savePick(db, pick);
  expect(await getPick(db, pick.day)).toEqual(pick);
});

test("null synopsis and category round-trip", async () => {
  const bare = { ...pick, synopsis: null, category: null };
  await savePick(db, bare);
  expect(await getPick(db, pick.day)).toEqual(bare);
});

test("getPick of another day is null", async () => {
  await savePick(db, pick);
  expect(await getPick(db, "2026-11-07")).toBeNull();
});

test("a second savePick for the same day replaces the first", async () => {
  await savePick(db, pick);
  await savePick(db, { ...pick, slug: "other", name: "Other" });
  expect((await getPick(db, pick.day))?.slug).toBe("other");
});

test("markPickAdded sets the status to added", async () => {
  await savePick(db, pick);
  await markPickAdded(db, pick.day);
  expect((await getPick(db, pick.day))?.status).toBe("added");
});

test("clearPick removes the row", async () => {
  await savePick(db, pick);
  await clearPick(db, pick.day);
  expect(await getPick(db, pick.day)).toBeNull();
});

test("listSkips returns only the given day and tolerates duplicates", async () => {
  await addSkip(db, "2026-11-06", "a");
  await addSkip(db, "2026-11-06", "a");
  await addSkip(db, "2026-11-06", "b");
  await addSkip(db, "2026-11-07", "c");
  expect(await listSkips(db, "2026-11-06")).toEqual(new Set(["a", "b"]));
});

test("saveInfo then listInfo returns the info under its key, and replaces it", async () => {
  await saveInfo(
    db,
    "birdle.example",
    "birdle",
    { synopsis: "One", category: "Nature" },
    "2026-11-06",
  );
  expect((await listInfo(db)).get("birdle.example")).toEqual({
    synopsis: "One",
    category: "Nature",
  });
  await saveInfo(
    db,
    "birdle.example",
    "birdle",
    { synopsis: null, category: null },
    "2026-11-07",
  );
  const info = await listInfo(db);
  expect(info.size).toBe(1);
  expect(info.get("birdle.example")).toEqual({
    synopsis: null,
    category: null,
  });
});
