import type { Game } from "../routine/types";
import type { StoredPick } from "../storage/pickRepo";
import { type CatalogGame, type GameInfo, gameUrlKey } from "./catalog";

function routineKeys(routine: Game[]): Set<string> {
  const keys = new Set<string>();
  for (const game of routine) {
    const key = gameUrlKey(game.url);
    if (key) keys.add(key);
  }
  return keys;
}

export function drawPick(
  catalog: CatalogGame[],
  routine: Game[],
  skipped: ReadonlySet<string>,
  rng: () => number = Math.random,
): CatalogGame | null {
  const taken = routineKeys(routine);
  const eligible = catalog.filter((game) => {
    const key = gameUrlKey(game.url);
    return key !== null && !taken.has(key) && !skipped.has(game.slug);
  });
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rng() * eligible.length)];
}

// A pick can reach the routine by other means (manual add, import) after it was
// drawn; it must then disappear without waiting for the next day.
export function visiblePick(
  pick: StoredPick | null,
  routine: Game[],
): StoredPick | null {
  if (!pick || pick.status === "added") return null;
  const key = gameUrlKey(pick.url);
  if (key && routineKeys(routine).has(key)) return null;
  return pick;
}

export function synopsisTargets(
  routine: Game[],
  catalog: CatalogGame[],
  known: ReadonlyMap<string, GameInfo>,
): CatalogGame[] {
  const byKey = new Map<string, CatalogGame>();
  for (const game of catalog) {
    const key = gameUrlKey(game.url);
    if (key && !byKey.has(key)) byKey.set(key, game);
  }
  const targets: CatalogGame[] = [];
  const seen = new Set<string>();
  for (const game of routine) {
    const key = gameUrlKey(game.url);
    if (!key || seen.has(key) || known.has(key)) continue;
    seen.add(key);
    const match = byKey.get(key);
    if (match) targets.push(match);
  }
  return targets;
}
