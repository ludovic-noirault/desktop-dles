import { isValidGameUrl } from "../routine/routine";

export const DEFAULT_FILE_NAME = "desktop-dles-games.json";
export const MAX_FILE_BYTES = 1_000_000;

const FORMAT = "desktop-dles/games";
const VERSION = 1;

export type SharedGame = { name: string; url: string };
export type ReadError = "notGamesFile" | "newerVersion" | "noGames";
export type ReadResult =
  | { ok: true; entries: SharedGame[] }
  | { ok: false; error: ReadError };
export type EntryStatus = "new" | "present" | "invalid";
export type ClassifiedEntry = SharedGame & { status: EntryStatus };

export function buildGamesFile(games: SharedGame[]): string {
  const file = {
    format: FORMAT,
    version: VERSION,
    games: games.map(({ name, url }) => ({ name, url })),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

export function parseGamesFile(text: string): ReadResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, error: "notGamesFile" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "notGamesFile" };
  }
  const { format, version, games } = data as Record<string, unknown>;
  if (format !== FORMAT) return { ok: false, error: "notGamesFile" };
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return { ok: false, error: "notGamesFile" };
  }
  if (version > VERSION) return { ok: false, error: "newerVersion" };
  if (version !== VERSION) return { ok: false, error: "notGamesFile" };
  if (!Array.isArray(games)) return { ok: false, error: "notGamesFile" };
  if (games.length === 0) return { ok: false, error: "noGames" };
  const entries = games.map((game) => {
    const entry = (typeof game === "object" && game !== null ? game : {}) as {
      name?: unknown;
      url?: unknown;
    };
    return { name: asString(entry.name), url: asString(entry.url) };
  });
  return { ok: true, entries };
}

// The size check comes first so an oversized file is never read into memory.
export async function readGamesFile(file: Blob): Promise<ReadResult> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "notGamesFile" };
  try {
    return parseGamesFile(await file.text());
  } catch {
    // A file deleted or locked after the pick rejects here.
    return { ok: false, error: "notGamesFile" };
  }
}

export function classifyEntries(
  entries: SharedGame[],
  current: SharedGame[],
): ClassifiedEntry[] {
  // Normalising through URL makes "https://x.net" and "https://X.net/" equal.
  const known = new Set(current.map((game) => new URL(game.url).href));
  return entries.map((entry) => {
    const name = entry.name.trim();
    const url = entry.url.trim();
    if (name === "" || !isValidGameUrl(url)) {
      return { name, url, status: "invalid" };
    }
    const href = new URL(url).href;
    if (known.has(href)) return { name, url, status: "present" };
    known.add(href);
    return { name, url, status: "new" };
  });
}
