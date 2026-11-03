import { invoke } from "@tauri-apps/api/core";

export type PanelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// The Rust commands run on a multi-thread runtime and their mutex is not FIFO,
// so each invoke starts only after the previous one settled.
let queue: Promise<unknown> = Promise.resolve();
const ordered = <T>(run: () => Promise<T>): Promise<T> => {
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
};

export const showGame = (
  id: number,
  url: string,
  bounds: PanelBounds,
): Promise<void> => ordered(() => invoke("show_game", { id, url, bounds }));

export const setGameBounds = (bounds: PanelBounds): Promise<void> =>
  ordered(() => invoke("set_game_bounds", { bounds }));

export const hideGames = (): Promise<void> =>
  ordered(() => invoke("hide_games"));

export const reloadGame = (id: number, url: string): Promise<void> =>
  ordered(() => invoke("reload_game", { id, url }));

export const closeGame = (id: number): Promise<void> =>
  ordered(() => invoke("close_game", { id }));
