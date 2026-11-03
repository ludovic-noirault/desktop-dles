import {
  createContext,
  type Dispatch,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { initRoutine, routineReducer } from "../routine/routine";
import type { Game, RoutineAction, RoutineState } from "../routine/types";
import { type Db, openDb } from "../storage/db";
import { getShuffle, listGames } from "../storage/gamesRepo";
import { strings } from "../strings";

// A second openDb() opens a new pool on which the plugin skips migrations.
let dbPromise: Promise<Db> | undefined;
export const getDb = (): Promise<Db> => {
  dbPromise ??= openDb();
  return dbPromise;
};

type Loaded = { games: Game[]; shuffle: boolean; initial: RoutineState };

type RoutineContextValue = {
  state: RoutineState;
  games: Game[];
  shuffle: boolean;
  dispatch: Dispatch<RoutineAction>;
  refresh(): Promise<void>;
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
      const [games, shuffle] = await Promise.all([
        listGames(db),
        getShuffle(db),
      ]);
      // StrictMode runs this twice; the cancelled run must not shuffle again.
      if (!cancelled) {
        setLoaded({ games, shuffle, initial: initRoutine(games, shuffle) });
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
  // The launch value drives the routine; `shuffle` is the DB value for the checkbox.
  const launchShuffle = useRef(loaded.shuffle);

  const refresh = useCallback(async () => {
    const db = await getDb();
    const [nextGames, nextShuffle] = await Promise.all([
      listGames(db),
      getShuffle(db),
    ]);
    setGames(nextGames);
    setShuffle(nextShuffle);
    dispatch({
      type: "sync",
      games: nextGames,
      shuffle: launchShuffle.current,
    });
  }, []);

  return (
    <RoutineContext.Provider
      value={{ state, games, shuffle, dispatch, refresh }}
    >
      {children}
    </RoutineContext.Provider>
  );
}
