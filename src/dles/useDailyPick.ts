import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDb, useRoutine } from "../app/RoutineProvider";
import type { StoredPick } from "../storage/pickRepo";
import { type GameInfo, gameUrlKey } from "./catalog";
import { fetchCatalogHtml, fetchGamePageHtml } from "./client";
import { createDailyPick } from "./dailyPick";
import { visiblePick } from "./pick";

// One instance per app session: it owns the per-day catalog cache and the
// page request queue. Lazy because the database opens asynchronously.
let instance: Promise<ReturnType<typeof createDailyPick>> | null = null;
function dailyPick() {
  instance ??= getDb().then((db) =>
    createDailyPick({
      db,
      fetchCatalog: fetchCatalogHtml,
      fetchGamePage: fetchGamePageHtml,
    }),
  );
  return instance;
}

function withPickInfo(
  info: ReadonlyMap<string, GameInfo>,
  pick: StoredPick | null,
): ReadonlyMap<string, GameInfo> {
  const key = pick && gameUrlKey(pick.url);
  if (!pick || !key || !pick.synopsis) return info;
  return new Map(info).set(key, {
    synopsis: pick.synopsis,
    category: pick.category,
  });
}

export function useDailyPick() {
  const { state, games, refresh } = useRoutine();
  const day = state.day;
  const [stored, setStored] = useState<StoredPick | null>(null);
  const [info, setInfo] = useState<ReadonlyMap<string, GameInfo>>(new Map());
  const [busy, setBusy] = useState(false);
  // Read at call time so a change of routine does not redraw the pick.
  const gamesRef = useRef(games);
  gamesRef.current = games;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const api = await dailyPick();
      const loaded = await api.load(day, gamesRef.current);
      if (cancelled) return;
      setStored(loaded);
      setInfo((prev) => withPickInfo(prev, loaded));
      const filled = await api.fillSynopses(gamesRef.current, day);
      if (!cancelled) {
        setInfo((prev) => withPickInfo(new Map([...prev, ...filled]), loaded));
      }
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [day]);

  const add = useCallback(async () => {
    const api = await dailyPick();
    await api.add(day);
    await refresh();
  }, [day, refresh]);

  const another = useCallback(async () => {
    setBusy(true);
    try {
      const api = await dailyPick();
      const next = await api.another(day, gamesRef.current);
      setStored(next);
      setInfo((prev) => withPickInfo(prev, next));
    } finally {
      setBusy(false);
    }
  }, [day]);

  const pick = useMemo(() => visiblePick(stored, games), [stored, games]);
  return { pick, info, busy, add, another };
}
