import { describe, expect, it } from "vitest";
import { buildUpdaterJson } from "./updater-json";

const macFile = "Desktop.Dles_aarch64.app.tar.gz";
const winFile = "Desktop.Dles_0.3.0_x64-setup.exe";
const base = {
  version: "0.3.0",
  notes: "Some notes",
  pubDate: "2026-11-05T10:00:00Z",
  repo: "ludovic-noirault/desktop-dles",
  assetNames: [macFile, winFile],
};
const mac = {
  name: "Desktop.Dles_aarch64.app.tar.gz.sig",
  signature: "SIG-MAC",
};
const win = {
  name: "Desktop.Dles_0.3.0_x64-setup.exe.sig",
  signature: "SIG-WIN",
};

describe("buildUpdaterJson", () => {
  it("maps both platforms", () => {
    expect(buildUpdaterJson({ ...base, assets: [mac, win] })).toEqual({
      version: "0.3.0",
      notes: "Some notes",
      pub_date: "2026-11-05T10:00:00Z",
      platforms: {
        "darwin-aarch64": {
          signature: "SIG-MAC",
          url: "https://github.com/ludovic-noirault/desktop-dles/releases/download/v0.3.0/Desktop.Dles_aarch64.app.tar.gz",
        },
        "windows-x86_64": {
          signature: "SIG-WIN",
          url: "https://github.com/ludovic-noirault/desktop-dles/releases/download/v0.3.0/Desktop.Dles_0.3.0_x64-setup.exe",
        },
      },
    });
  });
  it("encodes asset names", () => {
    const json = buildUpdaterJson({
      ...base,
      assetNames: ["Desktop Dles.app.tar.gz", winFile],
      assets: [{ ...mac, name: "Desktop Dles.app.tar.gz.sig" }, win],
    });
    expect(json.platforms["darwin-aarch64"].url).toBe(
      "https://github.com/ludovic-noirault/desktop-dles/releases/download/v0.3.0/Desktop%20Dles.app.tar.gz",
    );
  });
  it("ignores other signatures", () => {
    const withExtra = buildUpdaterJson({
      ...base,
      assets: [mac, { name: "foo.msi.sig", signature: "X" }, win],
    });
    expect(withExtra).toEqual(
      buildUpdaterJson({ ...base, assets: [mac, win] }),
    );
  });
  it("throws when a platform is missing", () => {
    expect(() => buildUpdaterJson({ ...base, assets: [mac] })).toThrow(
      /windows-x86_64/,
    );
  });
  it("throws when a platform matches twice", () => {
    const again = { ...mac, name: "Other_aarch64.app.tar.gz.sig" };
    expect(() =>
      buildUpdaterJson({ ...base, assets: [mac, again, win] }),
    ).toThrow(/darwin-aarch64/);
  });
  it("throws naming the archive missing from the release assets", () => {
    expect(() =>
      buildUpdaterJson({ ...base, assetNames: [winFile], assets: [mac, win] }),
    ).toThrow(macFile);
  });
});
