process.env.TZ = "Europe/Paris";

import { expect, test } from "vitest";
import { dayKey, msUntilNextMidnight, previousDay } from "./day";

test("dayKey uses the local date on both sides of midnight", () => {
  expect(dayKey(new Date(2026, 10, 5, 23, 59, 59))).toBe("2026-11-05");
  expect(dayKey(new Date(2026, 10, 6, 0, 0, 0))).toBe("2026-11-06");
  expect(dayKey(new Date(2026, 0, 3, 12))).toBe("2026-01-03");
});

test("previousDay crosses months, years and the spring DST change", () => {
  expect(previousDay("2026-03-01")).toBe("2026-02-28");
  expect(previousDay("2026-01-01")).toBe("2025-12-31");
  expect(previousDay("2026-03-30")).toBe("2026-03-29");
  expect(previousDay("2026-10-26")).toBe("2026-10-25");
});

test("msUntilNextMidnight counts real time on a DST day", () => {
  expect(msUntilNextMidnight(new Date(2026, 10, 5, 23, 0))).toBe(3_600_000);
  // 2026-03-29 has 23 hours in Paris.
  expect(msUntilNextMidnight(new Date(2026, 2, 29, 0, 30))).toBe(
    22.5 * 3_600_000,
  );
});
