import { describe, expect, it } from "vitest";
import { clampSidebarWidth } from "./sidebarWidth";

describe("clampSidebarWidth", () => {
  it("raises a width under the minimum", () => {
    expect(clampSidebarWidth(100, 1200)).toBe(180);
  });
  it("keeps a width in range", () => {
    expect(clampSidebarWidth(400, 1200)).toBe(400);
  });
  it("caps at half the window", () => {
    expect(clampSidebarWidth(900, 1200)).toBe(600);
  });
  it("keeps the minimum in a tiny window", () => {
    expect(clampSidebarWidth(300, 300)).toBe(180);
  });
});
