import { invoke } from "@tauri-apps/api/core";

export const exportGames = (contents: string): Promise<boolean> =>
  invoke("export_games", { contents });
