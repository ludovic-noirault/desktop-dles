import { type ReactNode, useEffect, useReducer, useRef } from "react";
import { strings } from "../strings";
import { UpdateOffer } from "../update/UpdateOffer";
import { findUpdate, type PendingUpdate } from "../update/updater";
import { fetchProbe, isOnline } from "./network";
import { initialStartup, startupReducer } from "./startup";

const reducer = startupReducer(import.meta.env.DEV);

export function StartupGate({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialStartup);
  const pending = useRef<PendingUpdate | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (state.status === "probing") {
      isOnline(fetchProbe).then((ok) => {
        if (!cancelled) dispatch({ type: ok ? "probe-ok" : "probe-failed" });
      });
    } else if (state.status === "checking") {
      findUpdate()
        .catch((err) => {
          console.error(err);
          return null;
        })
        .then((found) => {
          if (cancelled) return;
          pending.current = found;
          dispatch(
            found
              ? { type: "update-found", update: found }
              : { type: "no-update" },
          );
        });
    }
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  const install = () => {
    const update = pending.current;
    if (!update) return;
    dispatch({ type: "install" });
    update
      .install((fraction) => dispatch({ type: "progress", progress: fraction }))
      .catch((err) => {
        console.error(err);
        dispatch({ type: "install-failed" });
      });
  };

  switch (state.status) {
    case "done":
      return children;
    case "probing":
    case "checking":
      return (
        <div className="splash" role="status">
          <h1>{strings.appName}</h1>
          <p>{strings.startup.starting}</p>
        </div>
      );
    case "offline":
      return (
        <div className="splash">
          <h1>{strings.startup.offlineTitle}</h1>
          <p>{strings.startup.offlineBody}</p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              onClick={() => dispatch({ type: "retry" })}
            >
              {strings.startup.retry}
            </button>
            <button
              type="button"
              className="link"
              onClick={() => dispatch({ type: "continue" })}
            >
              {strings.startup.continueAnyway}
            </button>
          </div>
        </div>
      );
    case "update-available":
    case "installing":
      return (
        <div className="splash">
          <UpdateOffer
            update={state.update}
            progress={state.status === "installing" ? state.progress : null}
            installing={state.status === "installing"}
            failed={false}
            onInstall={install}
            onLater={() => dispatch({ type: "later" })}
            onContinue={() => dispatch({ type: "continue" })}
          />
        </div>
      );
    case "install-failed":
      return (
        <div className="splash">
          <UpdateOffer
            // The reducer drops the update on failure; the failed view only needs a placeholder.
            update={pending.current ?? { version: "", notes: null }}
            progress={null}
            installing={false}
            failed
            onInstall={install}
            onLater={() => dispatch({ type: "later" })}
            onContinue={() => dispatch({ type: "continue" })}
          />
        </div>
      );
  }
}
