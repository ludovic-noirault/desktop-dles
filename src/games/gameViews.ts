import { invoke } from "@tauri-apps/api/core";

export type PanelBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const showGame = (
  id: number,
  url: string,
  bounds: PanelBounds,
): Promise<void> => invoke("show_game", { id, url, bounds });

export const setGameBounds = (bounds: PanelBounds): Promise<void> =>
  invoke("set_game_bounds", { bounds });

export const hideGames = (): Promise<void> => invoke("hide_games");

export const reloadGame = (id: number, url: string): Promise<void> =>
  invoke("reload_game", { id, url });

export const closeGame = (id: number): Promise<void> =>
  invoke("close_game", { id });
