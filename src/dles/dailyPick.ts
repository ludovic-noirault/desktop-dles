import type { Game } from "../routine/types";
import type { Db } from "../storage/db";
import { addGame } from "../storage/gamesRepo";
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
} from "../storage/pickRepo";
import {
  type CatalogGame,
  type GameInfo,
  gameUrlKey,
  parseCatalog,
  parseGamePage,
} from "./catalog";
import { drawPick, synopsisTargets } from "./pick";

export type DlesDeps = {
  db: Db;
  fetchCatalog(): Promise<string>;
  fetchGamePage(slug: string): Promise<string>;
  rng?: () => number;
};

export function createDailyPick(deps: DlesDeps) {
  const { db, fetchCatalog, fetchGamePage, rng } = deps;
  let catalogCache: { day: string; promise: Promise<CatalogGame[]> } | null =
    null;
  const loading = new Map<string, Promise<StoredPick | null>>();

  // Concurrent callers share one request; a failure is not kept so the next
  // user action can retry instead of staying blind until restart.
  function catalogFor(day: string): Promise<CatalogGame[] | null> {
    if (catalogCache?.day !== day) {
      const promise = fetchCatalog().then(parseCatalog);
      catalogCache = { day, promise };
      promise.catch(() => {
        if (catalogCache?.promise === promise) catalogCache = null;
      });
    }
    return catalogCache.promise.catch(() => null);
  }

  // Null info on failure: the pick stays usable with its name only.
  async function fetchInfo(game: CatalogGame, day: string) {
    try {
      const info = parseGamePage(await fetchGamePage(game.slug));
      const key = gameUrlKey(game.url);
      if (key) await saveInfo(db, key, game.slug, info, day);
      return info;
    } catch {
      return null;
    }
  }

  async function draw(
    day: string,
    routine: Game[],
    catalog: CatalogGame[],
  ): Promise<StoredPick | null> {
    const game = drawPick(catalog, routine, await listSkips(db, day), rng);
    if (!game) {
      await clearPick(db, day);
      return null;
    }
    const info: GameInfo = (await fetchInfo(game, day)) ?? {
      synopsis: null,
      category: null,
    };
    const pick: StoredPick = { ...game, ...info, day, status: "shown" };
    await savePick(db, pick);
    return pick;
  }

  async function drawForDay(day: string, routine: Game[]) {
    const stored = await getPick(db, day);
    if (stored) return stored;
    const catalog = await catalogFor(day);
    return catalog ? draw(day, routine, catalog) : null;
  }

  return {
    load(day: string, routine: Game[]): Promise<StoredPick | null> {
      const running = loading.get(day);
      if (running) return running;
      const promise = drawForDay(day, routine).finally(() =>
        loading.delete(day),
      );
      loading.set(day, promise);
      return promise;
    },

    async another(day: string, routine: Game[]): Promise<StoredPick | null> {
      const current = await getPick(db, day);
      const catalog = await catalogFor(day);
      if (!catalog) return current;
      if (current) await addSkip(db, day, current.slug);
      return draw(day, routine, catalog);
    },

    async add(day: string): Promise<void> {
      const pick = await getPick(db, day);
      if (!pick) return;
      await addGame(db, pick.name, pick.url, day);
      await markPickAdded(db, day);
    },

    async fillSynopses(
      routine: Game[],
      day: string,
    ): Promise<Map<string, GameInfo>> {
      const known = await listInfo(db);
      const catalog = await catalogFor(day);
      if (!catalog) return known;
      const targets = synopsisTargets(routine, catalog, known);
      if (targets.length === 0) return known;
      // One at a time: a page request per routine game must not burst on dles.gg.
      for (const game of targets) await fetchInfo(game, day);
      return listInfo(db);
    },
  };
}
