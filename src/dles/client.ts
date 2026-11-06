import { invoke } from "@tauri-apps/api/core";

export const fetchCatalogHtml = (): Promise<string> => invoke("dles_catalog");

export const fetchGamePageHtml = (slug: string): Promise<string> =>
  invoke("dles_game_page", { slug });
