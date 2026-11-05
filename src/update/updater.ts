import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import type { UpdateInfo } from "../startup/startup";
import { fractionOf, nextProgress, type ProgressState } from "./progress";

export type PendingUpdate = UpdateInfo & {
  install(onProgress: (fraction: number | null) => void): Promise<void>;
};

// Rejects on failure: the splash and Settings treat a failed check differently.
export async function findUpdate(): Promise<PendingUpdate | null> {
  const update = await check({ timeout: 10000 });
  if (!update) return null;
  return {
    version: update.version,
    notes: update.body?.trim() || null,
    async install(onProgress) {
      let state: ProgressState = { total: null, received: 0 };
      await update.downloadAndInstall((event) => {
        state = nextProgress(state, event);
        onProgress(fractionOf(state));
      });
      // On Windows the installer exits the app before this line; that is expected.
      await relaunch();
    },
  };
}
