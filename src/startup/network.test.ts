import { afterEach, describe, expect, it, vi } from "vitest";
import { isOnline, PROBE_TIMEOUT_MS, type Probe } from "./network";

const urls = ["https://a.test", "https://b.test"];

afterEach(() => {
  vi.useRealTimers();
});

describe("isOnline", () => {
  it("online when one host answers and the other fails", async () => {
    const probe: Probe = (url) =>
      url === urls[0] ? Promise.reject(new Error("down")) : Promise.resolve();
    expect(await isOnline(probe, urls)).toBe(true);
  });

  it("offline when every host fails", async () => {
    const probe: Probe = () => Promise.reject(new Error("down"));
    expect(await isOnline(probe, urls)).toBe(false);
  });

  it("offline when no host answers before the timeout", async () => {
    vi.useFakeTimers();
    const probe: Probe = () => new Promise(() => {});
    const result = isOnline(probe, urls);
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    expect(await result).toBe(false);
  });

  it("aborts pending probes once settled", async () => {
    const signals: AbortSignal[] = [];
    const probe: Probe = (url, signal) => {
      signals.push(signal);
      return url === urls[0] ? Promise.resolve() : new Promise(() => {});
    };
    expect(await isOnline(probe, urls)).toBe(true);
    expect(signals[1].aborted).toBe(true);
  });

  it("aborts pending probes after a timeout", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const probe: Probe = (_url, signal) => {
      signals.push(signal);
      return new Promise(() => {});
    };
    const result = isOnline(probe, urls, 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBe(false);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});
