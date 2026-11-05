import {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { dayKey, msUntilNextMidnight } from "../routine/day";
import { initRoutine, routineReducer, toggleAnswer } from "../routine/routine";
import {
  dayStreak as computeDayStreak,
  gameStreak,
  statusesOn,
} from "../routine/streaks";
import type {
  DayRow,
  DayStatus,
  Game,
  GameLifetime,
  RoutineAction,
  RoutineState,
} from "../routine/types";
import {
  clearDayStatus,
  listDayRows,
  listLifetimes,
  setDayStatus,
} from "../storage/dayRepo";
import { type Db, openDb } from "../storage/db";
import { getShuffle, listGames } from "../storage/gamesRepo";
import { strings } from "../strings";

// A second openDb() opens a new pool on which the plugin skips migrations.
let dbPromise: Promise<Db> | undefined;
export const getDb = (): Promise<Db> => {
  dbPromise ??= openDb();
  return dbPromise;
};

const loadAll = async (db: Db) => {
  const [games, shuffle, rows, lifetimes] = await Promise.all([
    listGames(db),
    getShuffle(db),
    listDayRows(db),
    listLifetimes(db),
  ]);
  return { games, shuffle, rows, lifetimes };
};

type Loaded = {
  games: Game[];
  shuffle: boolean;
  rows: DayRow[];
  lifetimes: GameLifetime[];
  initial: RoutineState;
};

type RoutineContextValue = {
  state: RoutineState;
  games: Game[];
  shuffle: boolean;
  dispatch: Dispatch<RoutineAction>;
  refresh(): Promise<void>;
  answer(clicked: DayStatus): Promise<void>;
  busy: boolean;
  gameStreaks: ReadonlyMap<number, number>;
  dayStreak: number;
};

const RoutineContext = createContext<RoutineContextValue | null>(null);

export function useRoutine(): RoutineContextValue {
  const value = useContext(RoutineContext);
  if (!value) throw new Error("useRoutine outside RoutineProvider");
  return value;
}

export function RoutineProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const { games, shuffle, rows, lifetimes } = await loadAll(db);
      // StrictMode runs this twice; the cancelled run must not shuffle again.
      if (!cancelled) {
        const today = dayKey(new Date());
        setLoaded({
          games,
          shuffle,
          rows,
          lifetimes,
          initial: initRoutine(games, shuffle, today, statusesOn(rows, today)),
        });
      }
    })().catch((err) => {
      console.error(err);
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p role="alert">{strings.loadError}</p>;
  if (!loaded) return null;
  return <Loaded loaded={loaded}>{children}</Loaded>;
}

function Loaded({ loaded, children }: { loaded: Loaded; children: ReactNode }) {
  const [state, dispatch] = useReducer(routineReducer, loaded.initial);
  const [games, setGames] = useState(loaded.games);
  const [shuffle, setShuffle] = useState(loaded.shuffle);
  const [rows, setRows] = useState(loaded.rows);
  const [lifetimes, setLifetimes] = useState(loaded.lifetimes);
  const [busy, setBusy] = useState(false);

  // Refs let async callbacks and listeners read the latest state, not a stale closure.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Set synchronously before any await so two clicks in one frame write once.
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    const db = await getDb();
    const next = await loadAll(db);
    setGames(next.games);
    setShuffle(next.shuffle);
    setRows(next.rows);
    setLifetimes(next.lifetimes);
    // `sync` gets the launch value; the `shuffle` state mirrors the DB for the checkbox.
    dispatch({ type: "sync", games: next.games, shuffle: loaded.shuffle });
  }, [loaded.shuffle]);

  const answer = useCallback(async (clicked: DayStatus) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const current = stateRef.current;
      const game = current.order[current.current];
      if (!game) return;
      const next = toggleAnswer(current.statuses.get(game.id), clicked);
      const today = dayKey(new Date());
      const db = await getDb();
      if (next) await setDayStatus(db, game.id, today, next);
      else await clearDayStatus(db, game.id, today);
      const nextRows = await listDayRows(db);
      setRows(nextRows);
      if (today !== stateRef.current.day) {
        dispatch({
          type: "day",
          day: today,
          statuses: statusesOn(nextRows, today),
        });
      } else {
        dispatch({ type: "answer", status: next });
      }
    } catch (err) {
      console.error(err);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const reloadDay = useCallback(async () => {
    const today = dayKey(new Date());
    if (today === stateRef.current.day) return;
    try {
      const nextRows = await listDayRows(await getDb());
      setRows(nextRows);
      dispatch({
        type: "day",
        day: today,
        statuses: statusesOn(nextRows, today),
      });
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Re-armed whenever the day changes; the focus listener covers a sleeping machine.
  // biome-ignore lint/correctness/useExhaustiveDependencies: state.day is the re-arm trigger
  useEffect(() => {
    const timer = setTimeout(reloadDay, msUntilNextMidnight(new Date()) + 1000);
    return () => clearTimeout(timer);
  }, [state.day, reloadDay]);

  useEffect(() => {
    window.addEventListener("focus", reloadDay);
    return () => window.removeEventListener("focus", reloadDay);
  }, [reloadDay]);

  const gameStreaks = useMemo(
    () =>
      new Map(
        state.order.map((g) => [g.id, gameStreak(g.id, rows, state.day)]),
      ),
    [state.order, rows, state.day],
  );
  const dayStreak = useMemo(
    () => computeDayStreak(lifetimes, rows, state.day),
    [lifetimes, rows, state.day],
  );

  return (
    <RoutineContext.Provider
      value={{
        state,
        games,
        shuffle,
        dispatch,
        refresh,
        answer,
        busy,
        gameStreaks,
        dayStreak,
      }}
    >
      {children}
    </RoutineContext.Provider>
  );
}
