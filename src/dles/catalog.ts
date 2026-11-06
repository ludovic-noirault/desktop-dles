import { isValidGameUrl } from "../routine/routine";

export type CatalogGame = { slug: string; name: string; url: string };
export type GameInfo = { synopsis: string | null; category: string | null };

// One key per game page, so the same game listed under slightly different URLs
// (www, trailing slash, index.html, tracking query) matches.
export function gameUrlKey(url: string): string | null {
  if (!isValidGameUrl(url)) return null;
  try {
    const { hostname, pathname } = new URL(url.trim());
    const host = hostname.toLowerCase().replace(/^www\./, "");
    const path = pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

function flightText(html: string): string {
  const parts: string[] = [];
  for (const m of html.matchAll(
    /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g,
  )) {
    try {
      const args: unknown = JSON.parse(m[1]);
      if (Array.isArray(args) && typeof args[1] === "string") {
        parts.push(args[1]);
      }
    } catch {
      // A push we cannot read is skipped; a missing part breaks the array below.
    }
  }
  return parts.join("");
}

// Slice of the JSON array starting at text[start] === "[", brackets inside
// string literals do not count.
function sliceArray(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[") depth++;
    else if (c === "]" && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

export function parseCatalog(html: string): CatalogGame[] {
  const text = flightText(html);
  const marker = '"allGames":[';
  const at = text.indexOf(marker);
  if (at < 0) return [];
  try {
    const slice = sliceArray(text, at + marker.length - 1);
    if (slice === null) return [];
    const raw: unknown = JSON.parse(slice);
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const games: CatalogGame[] = [];
    for (const entry of raw) {
      if (typeof entry !== "object" || entry === null) continue;
      const { slug, name, url } = entry as Record<string, unknown>;
      if (typeof slug !== "string" || !/^[a-z0-9-]+$/.test(slug)) continue;
      if (typeof name !== "string" || name.trim() === "") continue;
      if (typeof url !== "string") continue;
      const key = gameUrlKey(url);
      if (key === null || seen.has(key)) continue;
      seen.add(key);
      games.push({ slug, name: name.trim(), url });
    }
    return games;
  } catch {
    return [];
  }
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

const decode = (s: string) =>
  s.replace(/&(?:amp|quot|#39|#x27|lt|gt);/g, (e) => ENTITIES[e]);

export function parseGamePage(html: string): GameInfo {
  for (const m of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      const data: unknown = JSON.parse(m[1]);
      if (
        typeof data === "object" &&
        data !== null &&
        (data as Record<string, unknown>)["@type"] === "SoftwareApplication"
      ) {
        const { description, genre } = data as Record<string, unknown>;
        return { synopsis: text(description), category: text(genre) };
      }
    } catch {
      // Not JSON: try the next block.
    }
  }
  const meta = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  return { synopsis: meta ? text(decode(meta[1])) : null, category: null };
}
