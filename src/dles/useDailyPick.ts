import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDb, useRoutine } from "../app/RoutineProvider";
import type { StoredPick } from "../storage/pickRepo";
import type { GameInfo } from "./catalog";
import { fetchCatalogHtml, fetchGamePageHtml } from "./client";
import { createDailyPick } from "./dailyPick";
import { visiblePick, withPickInfo } from "./pick";

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

export function useDailyPick() {
  const { state, games, refresh } = useRoutine();
  const day = state.day;
  const [stored, setStored] = useState<StoredPick | null>(null);
  const [info, setInfo] = useState<ReadonlyMap<string, GameInfo>>(new Map());
  const [busy, setBusy] = useState(false);
  // Read at call time so a change of routine does not redraw the pick.
  const gamesRef = useRef(games);
  gamesRef.current = games;
  const dayRef = useRef(day);
  dayRef.current = day;
  // Set synchronously before any await so two clicks in one frame run once.
  const busyRef = useRef(false);
  const hasRoutine = games.length > 0;

  useEffect(() => {
    // Yesterday's pick must not show while today's loads.
    setStored(null);
    // The pick is for people who already have a routine.
    if (!hasRoutine) return;
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
  }, [day, hasRoutine]);

  // Runs one card action; both share the guard and the busy flag.
  const run = useCallback(async (action: (day: string) => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action(dayRef.current);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const add = useCallback(
    () =>
      run(async (startDay) => {
        const api = await dailyPick();
        await api.add(startDay);
        await refresh();
      }),
    [run, refresh],
  );

  const another = useCallback(
    () =>
      run(async (startDay) => {
        const api = await dailyPick();
        const next = await api.another(startDay, gamesRef.current);
        // The day changed meanwhile: that result belongs to a past day.
        if (dayRef.current !== startDay) return;
        setStored(next);
        setInfo((prev) => withPickInfo(prev, next));
      }),
    [run],
  );

  const pick = useMemo(
    () => visiblePick(stored?.day === day ? stored : null, games),
    [stored, day, games],
  );
  return { pick, info, busy, add, another };
}
