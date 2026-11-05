export type UpdateInfo = { version: string; notes: string | null };

export type StartupState =
  | { status: "probing" }
  | { status: "offline" }
  | { status: "checking" }
  | { status: "update-available"; update: UpdateInfo }
  | { status: "installing"; update: UpdateInfo; progress: number | null }
  | { status: "install-failed" }
  | { status: "done" };

export type StartupEvent =
  | { type: "probe-ok" }
  | { type: "probe-failed" }
  | { type: "update-found"; update: UpdateInfo }
  | { type: "no-update" }
  | { type: "retry" }
  | { type: "continue" }
  | { type: "later" }
  | { type: "install" }
  | { type: "progress"; progress: number | null }
  | { type: "install-failed" };

export const initialStartup: StartupState = { status: "probing" };

// skipCheck is true in development, where there is no signed release to update to.
// Events that do not fit the current status are ignored: probes and checks are async,
// so a late result must not move a state the user has already left.
export function startupReducer(skipCheck: boolean) {
  return (state: StartupState, event: StartupEvent): StartupState => {
    switch (state.status) {
      case "probing":
        if (event.type === "probe-ok") {
          return { status: skipCheck ? "done" : "checking" };
        }
        if (event.type === "probe-failed") return { status: "offline" };
        return state;
      case "offline":
        if (event.type === "retry") return { status: "probing" };
        if (event.type === "continue") return { status: "done" };
        return state;
      case "checking":
        if (event.type === "update-found") {
          return { status: "update-available", update: event.update };
        }
        if (event.type === "no-update") return { status: "done" };
        return state;
      case "update-available":
        if (event.type === "later") return { status: "done" };
        if (event.type === "install") {
          return { status: "installing", update: state.update, progress: null };
        }
        return state;
      case "installing":
        if (event.type === "progress") {
          return { ...state, progress: event.progress };
        }
        if (event.type === "install-failed")
          return { status: "install-failed" };
        return state;
      case "install-failed":
        if (event.type === "continue") return { status: "done" };
        return state;
      case "done":
        return state;
    }
  };
}
