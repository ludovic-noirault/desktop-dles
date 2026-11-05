import type { UpdateInfo } from "../startup/startup";
import { strings } from "../strings";

type Props = {
  update: UpdateInfo;
  progress: number | null;
  installing: boolean;
  failed: boolean;
  onInstall(): void;
  onLater(): void;
  onContinue(): void;
};

export function UpdateOffer({
  update,
  progress,
  installing,
  failed,
  onInstall,
  onLater,
  onContinue,
}: Props) {
  if (failed) {
    return (
      <section className="update-offer">
        <p role="alert">{strings.update.installFailed}</p>
        <div className="actions">
          <button type="button" className="primary" onClick={onContinue}>
            {strings.update.continue}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="update-offer">
      <h2>{strings.update.available(update.version)}</h2>
      {update.notes && <p className="notes">{update.notes}</p>}
      {installing ? (
        <div role="status">
          <p>{strings.update.downloading}</p>
          <progress
            // No value attribute gives the native indeterminate bar.
            value={progress ?? undefined}
            max={1}
            aria-label={strings.update.downloading}
          />
        </div>
      ) : (
        <>
          {isWindows && <p className="note">{strings.update.windowsNote}</p>}
          <div className="actions">
            <button type="button" className="primary" onClick={onInstall}>
              {strings.update.install}
            </button>
            <button type="button" onClick={onLater}>
              {strings.update.later}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const isWindows = navigator.userAgent.includes("Windows");
