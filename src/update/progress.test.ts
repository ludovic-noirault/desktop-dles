import { describe, expect, it } from "vitest";
import {
  type DownloadEvent,
  fractionOf,
  nextProgress,
  type ProgressState,
} from "./progress";

const fold = (events: DownloadEvent[]): ProgressState =>
  events.reduce(nextProgress, { total: null, received: 0 });

describe("download progress", () => {
  it("tracks received bytes against the announced size", () => {
    const state = fold([
      { event: "Started", data: { contentLength: 1000 } },
      { event: "Progress", data: { chunkLength: 250 } },
      { event: "Progress", data: { chunkLength: 250 } },
    ]);
    expect(fractionOf(state)).toBe(0.5);
  });

  it("stays indeterminate without a size", () => {
    const state = fold([
      { event: "Started", data: {} },
      { event: "Progress", data: { chunkLength: 250 } },
    ]);
    expect(fractionOf(state)).toBeNull();
  });

  it("never exceeds 1", () => {
    expect(fractionOf({ total: 100, received: 150 })).toBe(1);
  });
});
