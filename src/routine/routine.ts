import type { DayStatus, Game, RoutineAction, RoutineState } from "./types";

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

export function nextToDo(
  order: Game[],
  statuses: ReadonlyMap<number, DayStatus>,
  from: number,
): number {
  for (let step = 1; step <= order.length; step++) {
    const index = (from + step) % order.length;
    if (!statuses.has(order[index].id)) return index;
  }
  return -1;
}

export function toggleAnswer(
  previous: DayStatus | undefined,
  clicked: DayStatus,
): DayStatus | null {
  return clicked === previous ? null : clicked;
}

export function isRoutineDone(state: RoutineState): boolean {
  return (
    state.order.length > 0 && state.order.every((x) => state.statuses.has(x.id))
  );
}

export function initRoutine(
  games: Game[],
  shuffle: boolean,
  day: string,
  statuses: ReadonlyMap<number, DayStatus>,
  rng?: () => number,
): RoutineState {
  const order = buildRoutine(games, shuffle, rng);
  const first = order.findIndex((x) => !statuses.has(x.id));
  return { order, current: Math.max(0, first), day, statuses };
}

function open(state: RoutineState, index: number): RoutineState {
  if (!state.order[index]) return state;
  return { ...state, current: index };
}

function answer(state: RoutineState, status: DayStatus | null): RoutineState {
  const game = state.order[state.current];
  if (!game) return state;
  const statuses = new Map(state.statuses);
  if (status === null) {
    statuses.delete(game.id);
    return { ...state, statuses };
  }
  statuses.set(game.id, status);
  const next = nextToDo(state.order, statuses, state.current);
  return { ...state, statuses, current: next === -1 ? state.current : next };
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
  const statuses = new Map([...state.statuses].filter(([id]) => ids.has(id)));
  return { order, current, day: state.day, statuses };
}

export function routineReducer(
  state: RoutineState,
  action: RoutineAction,
): RoutineState {
  switch (action.type) {
    case "select":
      return open(state, action.index);
    case "answer":
      return answer(state, action.status);
    case "day":
      return { ...state, day: action.day, statuses: action.statuses };
    case "sync":
      return sync(state, action.games, action.shuffle);
  }
}
