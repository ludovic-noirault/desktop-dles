import { describe, expect, it } from "vitest";
import { branchType, nextVersion } from "./release";

describe("branchType", () => {
  it("accepts every allowed type", () => {
    for (const t of [
      "feat",
      "fix",
      "docs",
      "chore",
      "refactor",
      "test",
      "ci",
    ]) {
      expect(branchType(`${t}/x`)).toBe(t);
    }
  });
  it("accepts dots, dashes, underscores and slashes in the name", () => {
    expect(branchType("feat/a-b.c_d")).toBe("feat");
    expect(branchType("fix/a/b")).toBe("fix");
  });
  it("rejects malformed names", () => {
    for (const ref of [
      "feat/",
      "feat",
      "feature/x",
      "Feat/x",
      "feat/X",
      "main",
      "release/1.0",
    ]) {
      expect(branchType(ref)).toBeNull();
    }
  });
});

describe("nextVersion", () => {
  it("starts from 0.1.0 when no tag exists", () => {
    expect(nextVersion("feat", [])).toBe("0.2.0");
    expect(nextVersion("fix", [])).toBe("0.1.1");
  });
  it("bumps minor on feat and resets patch", () => {
    expect(nextVersion("feat", ["v0.2.3"])).toBe("0.3.0");
  });
  it("bumps patch on fix", () => {
    expect(nextVersion("fix", ["v0.2.0"])).toBe("0.2.1");
  });
  it("makes no release for other types", () => {
    for (const t of ["docs", "chore", "refactor", "test", "ci"] as const) {
      expect(nextVersion(t, ["v0.2.0"])).toBeNull();
    }
  });
  it("compares versions numerically, not as text", () => {
    expect(nextVersion("fix", ["v0.9.0", "v0.10.0"])).toBe("0.10.1");
  });
  it("ignores tags that are not vX.Y.Z", () => {
    expect(
      nextVersion("fix", ["v1.2", "app-v0.3.0", "latest", "v0.2.0", ""]),
    ).toBe("0.2.1");
  });
});
