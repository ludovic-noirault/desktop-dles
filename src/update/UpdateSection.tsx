import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { strings } from "../strings";
import { UpdateOffer } from "./UpdateOffer";
import { findUpdate, type PendingUpdate } from "./updater";

type State =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "check-failed" }
  | { status: "offer"; update: PendingUpdate }
  | { status: "installing"; update: PendingUpdate; progress: number | null }
  | { status: "install-failed" };

export function UpdateSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    getVersion().then(setVersion).catch(console.error);
  }, []);

  const check = () => {
    setState({ status: "checking" });
    findUpdate()
      .then((update) =>
        setState(
          update ? { status: "offer", update } : { status: "up-to-date" },
        ),
      )
      .catch((err) => {
        console.error(err);
        setState({ status: "check-failed" });
      });
  };

  const install = (update: PendingUpdate) => {
    // The updater itself refuses a second concurrent install.
    let failed = false;
    setState({ status: "installing", update, progress: null });
    update
      .install((progress) => {
        if (!failed) setState({ status: "installing", update, progress });
      })
      .catch((err) => {
        console.error(err);
        failed = true;
        setState({ status: "install-failed" });
      });
  };

  const backToIdle = () => setState({ status: "idle" });

  return (
    <section className="update-section">
      <h3>{strings.update.sectionTitle}</h3>
      {version && <p>{strings.update.installedVersion(version)}</p>}
      {state.status === "offer" || state.status === "installing" ? (
        <UpdateOffer
          update={state.update}
          progress={state.status === "installing" ? state.progress : null}
          installing={state.status === "installing"}
          failed={false}
          onInstall={() => install(state.update)}
          onLater={backToIdle}
          onContinue={backToIdle}
        />
      ) : state.status === "install-failed" ? (
        <UpdateOffer
          // The failed view shows no version; the placeholder only satisfies the props.
          update={{ version: "", notes: null }}
          progress={null}
          installing={false}
          failed
          onInstall={() => {}}
          onLater={backToIdle}
          onContinue={backToIdle}
        />
      ) : (
        <div className="actions">
          <button
            type="button"
            disabled={import.meta.env.DEV || state.status === "checking"}
            onClick={check}
          >
            {import.meta.env.DEV
              ? strings.update.devDisabled
              : state.status === "checking"
                ? strings.update.checking
                : strings.update.check}
          </button>
          {state.status === "up-to-date" && (
            <span role="status">{strings.update.upToDate}</span>
          )}
          {state.status === "check-failed" && (
            <span role="alert">{strings.update.checkFailed}</span>
          )}
        </div>
      )}
    </section>
  );
}
