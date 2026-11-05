export type Game = { id: number; name: string; url: string; position: number };

export type RoutineState = {
  order: Game[];
  current: number;
  opened: ReadonlySet<number>;
};

export type RoutineAction =
  | { type: "select"; index: number }
  | { type: "next" }
  | { type: "sync"; games: Game[]; shuffle: boolean };

export type DayStatus = "finished" | "ignored";

export type DayRow = { gameId: number; day: string; status: DayStatus };

export type GameLifetime = {
  id: number;
  addedDay: string | null;
  removedDay: string | null;
};
