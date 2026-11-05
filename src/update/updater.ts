import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import type { UpdateInfo } from "../startup/startup";
import { fractionOf, nextProgress, type ProgressState } from "./progress";

export type PendingUpdate = UpdateInfo & {
  install(onProgress: (fraction: number | null) => void): Promise<void>;
};

// Module-level so the guard outlives the component that started the install:
// leaving Settings mid-download must not allow a second downloadAndInstall.
let running: Promise<void> | null = null;

// Rejects on failure: the splash and Settings treat a failed check differently.
export async function findUpdate(): Promise<PendingUpdate | null> {
  const update = await check({ timeout: 10000 });
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body?.trim() || null,
    install(onProgress) {
      // A second caller joins the running install and gets no progress events.
      if (running) return running;
      let state: ProgressState = { total: null, received: 0 };
      const attempt = (async () => {
        await update.downloadAndInstall((event) => {
          state = nextProgress(state, event);
          onProgress(fractionOf(state));
        });
        // On Windows the installer exits the app before this line; that is expected.
        await relaunch();
      })();
      running = attempt;
      // Cleared on failure so a retry is possible; on success the app relaunches.
      attempt.catch(() => {
        running = null;
      });
      return attempt;
    },
  };
}
