import type { DownloadEvent } from "@tauri-apps/plugin-updater";

export type { DownloadEvent };

export type ProgressState = { total: number | null; received: number };

export function nextProgress(
  state: ProgressState,
  event: DownloadEvent,
): ProgressState {
  switch (event.event) {
    case "Started":
      return { total: event.data.contentLength ?? null, received: 0 };
    case "Progress":
      return { ...state, received: state.received + event.data.chunkLength };
    case "Finished":
      return state;
  }
}

export function fractionOf(state: ProgressState): number | null {
  if (!state.total) return null;
  return Math.min(1, Math.max(0, state.received / state.total));
}
