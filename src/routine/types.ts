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
