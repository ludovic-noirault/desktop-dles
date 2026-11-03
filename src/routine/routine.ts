import type { Game, RoutineAction, RoutineState } from "./types";

export function isValidGameUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed.startsWith("https://")) return false;
  try {
    return new URL(trimmed).hostname !== "";
  } catch {
    return false;
  }
}

const byPosition = (games: Game[]): Game[] =>
  [...games].sort((a, b) => a.position - b.position);

export function buildRoutine(
  games: Game[],
  shuffle: boolean,
  rng: () => number = Math.random,
): Game[] {
  const out = byPosition(games);
  if (!shuffle) return out;
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function moveGame(
  games: Game[],
  id: number,
  direction: "up" | "down",
): Game[] {
  const out = byPosition(games);
  const from = out.findIndex((x) => x.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from !== -1 && to >= 0 && to < out.length) {
    [out[from], out[to]] = [out[to], out[from]];
  }
  return out.map((x, position) => ({ ...x, position }));
}

export function initRoutine(
  games: Game[],
  shuffle: boolean,
  rng?: () => number,
): RoutineState {
  const order = buildRoutine(games, shuffle, rng);
  return {
    order,
    current: 0,
    opened: new Set(order.slice(0, 1).map((x) => x.id)),
  };
}

function open(state: RoutineState, index: number): RoutineState {
  const game = state.order[index];
  if (!game) return state;
  return {
    ...state,
    current: index,
    opened: new Set(state.opened).add(game.id),
  };
}

function sync(
  state: RoutineState,
  games: Game[],
  shuffle: boolean,
): RoutineState {
  let order: Game[];
  if (shuffle) {
    // Keep the launch-time shuffle: only deletions and additions change the order.
    const fresh = new Map(games.map((x) => [x.id, x]));
    const kept = state.order.flatMap((x) => fresh.get(x.id) ?? []);
    const known = new Set(kept.map((x) => x.id));
    order = [...kept, ...byPosition(games.filter((x) => !known.has(x.id)))];
  } else {
    order = buildRoutine(games, false);
  }

  const currentId = state.order[state.current]?.id;
  const stillThere = order.findIndex((x) => x.id === currentId);
  const current =
    stillThere !== -1
      ? stillThere
      : Math.max(0, Math.min(state.current, order.length - 1));
  const ids = new Set(order.map((x) => x.id));
  const opened = new Set([...state.opened].filter((id) => ids.has(id)));
  return open({ order, current, opened }, current);
}

export function routineReducer(
  state: RoutineState,
  action: RoutineAction,
): RoutineState {
  switch (action.type) {
    case "select":
      return open(state, action.index);
    case "next":
      return open(state, Math.min(state.current + 1, state.order.length - 1));
    case "sync":
      return sync(state, action.games, action.shuffle);
  }
}
