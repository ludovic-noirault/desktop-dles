import { beforeEach, describe, expect, it, vi } from "vitest";

const downloadAndInstall = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
  check: async () => ({ version: "1.0.0", body: null, downloadAndInstall }),
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

// Fresh module per test: a successful install keeps the guard set, as the app relaunches.
const load = async () => {
  vi.resetModules();
  return (await import("./updater")).findUpdate;
};

describe("install guard", () => {
  beforeEach(() => downloadAndInstall.mockReset());

  it("runs one download for concurrent installs, even from another check", async () => {
    let finish!: () => void;
    downloadAndInstall.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const findUpdate = await load();
    const first = await findUpdate();
    const second = await findUpdate();
    const a = first?.install(() => {});
    const b = second?.install(() => {});
    finish();
    await Promise.all([a, b]);
    expect(downloadAndInstall).toHaveBeenCalledTimes(1);
  });

  it("allows a retry once an install failed", async () => {
    downloadAndInstall.mockRejectedValueOnce(new Error("network"));
    downloadAndInstall.mockResolvedValueOnce(undefined);
    const update = await (await load())();
    await expect(update?.install(() => {})).rejects.toThrow("network");
    await update?.install(() => {});
    expect(downloadAndInstall).toHaveBeenCalledTimes(2);
  });
});
