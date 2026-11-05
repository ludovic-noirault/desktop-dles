import { describe, expect, it } from "vitest";
import {
  initialStartup,
  type StartupEvent,
  type StartupState,
  startupReducer,
} from "./startup";

const update = { version: "1.2.0", notes: "Fixes" };
const reduce = startupReducer(false);

const step = (state: StartupState, event: StartupEvent) => reduce(state, event);

describe("startupReducer", () => {
  it("starts by probing the network", () => {
    expect(initialStartup).toEqual({ status: "probing" });
  });

  it("probing + probe-ok -> checking", () => {
    expect(step({ status: "probing" }, { type: "probe-ok" })).toEqual({
      status: "checking",
    });
  });

  it("skips the check in development", () => {
    expect(
      startupReducer(true)({ status: "probing" }, { type: "probe-ok" }),
    ).toEqual({ status: "done" });
  });

  it("probing + probe-failed -> offline", () => {
    expect(step({ status: "probing" }, { type: "probe-failed" })).toEqual({
      status: "offline",
    });
  });

  it("offline + retry -> probing", () => {
    expect(step({ status: "offline" }, { type: "retry" })).toEqual({
      status: "probing",
    });
  });

  it("offline + continue -> done", () => {
    expect(step({ status: "offline" }, { type: "continue" })).toEqual({
      status: "done",
    });
  });

  it("checking + update-found -> update-available", () => {
    expect(
      step({ status: "checking" }, { type: "update-found", update }),
    ).toEqual({ status: "update-available", update });
  });

  it("checking + no-update -> done", () => {
    expect(step({ status: "checking" }, { type: "no-update" })).toEqual({
      status: "done",
    });
  });

  it("update-available + later -> done", () => {
    expect(
      step({ status: "update-available", update }, { type: "later" }),
    ).toEqual({ status: "done" });
  });

  it("update-available + install -> installing with unknown progress", () => {
    expect(
      step({ status: "update-available", update }, { type: "install" }),
    ).toEqual({ status: "installing", update, progress: null });
  });

  it("installing + progress -> installing with the new progress", () => {
    expect(
      step(
        { status: "installing", update, progress: null },
        { type: "progress", progress: 0.4 },
      ),
    ).toEqual({ status: "installing", update, progress: 0.4 });
  });

  it("installing + install-failed -> install-failed", () => {
    expect(
      step(
        { status: "installing", update, progress: 0.4 },
        { type: "install-failed" },
      ),
    ).toEqual({ status: "install-failed" });
  });

  it("install-failed + continue -> done", () => {
    expect(step({ status: "install-failed" }, { type: "continue" })).toEqual({
      status: "done",
    });
  });

  it("ignores events from another status", () => {
    const done: StartupState = { status: "done" };
    const offline: StartupState = { status: "offline" };
    expect(step(done, { type: "probe-ok" })).toBe(done);
    expect(step(done, { type: "update-found", update })).toBe(done);
    expect(step(offline, { type: "probe-ok" })).toBe(offline);
  });

  it("ignores a second install", () => {
    const installing: StartupState = {
      status: "installing",
      update,
      progress: 0.4,
    };
    expect(step(installing, { type: "install" })).toBe(installing);
  });
});
