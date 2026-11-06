import { expect, test } from "vitest";
import { dropIndex } from "./dragOrder";

const mids = [10, 30, 50, 70];

test("dropIndex counts the other rows whose midpoint is above the pointer", () => {
  expect(dropIndex(mids, 5, 0)).toBe(0);
  expect(dropIndex(mids, 35, 0)).toBe(1);
  expect(dropIndex(mids, 69, 0)).toBe(2);
  expect(dropIndex(mids, 200, 0)).toBe(3);
});

test("dropIndex ignores the dragged row's own midpoint", () => {
  expect(dropIndex(mids, 5, 3)).toBe(0);
  expect(dropIndex(mids, 35, 3)).toBe(2);
});
