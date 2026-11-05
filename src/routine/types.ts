export type Game = { id: number; name: string; url: string; position: number };

export type DayStatus = "finished" | "ignored";

export type RoutineState = {
  order: Game[];
  current: number;
  day: string;
  statuses: ReadonlyMap<number, DayStatus>;
};

export type RoutineAction =
  | { type: "select"; index: number }
  | { type: "answer"; status: DayStatus | null }
  | { type: "day"; day: string; statuses: ReadonlyMap<number, DayStatus> }
  | { type: "sync"; games: Game[]; shuffle: boolean };

export type DayRow = { gameId: number; day: string; status: DayStatus };

export type GameLifetime = {
  id: number;
  addedDay: string | null;
  removedDay: string | null;
};
