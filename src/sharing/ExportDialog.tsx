import { useEffect, useRef, useState } from "react";
import type { Game } from "../routine/types";
import { strings } from "../strings";
import { exportGames } from "./commands";
import { buildGamesFile } from "./gamesFile";

export function ExportDialog({
  games,
  onClose,
}: {
  games: Game[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const allBox = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState(() => new Set(games.map((g) => g.id)));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const count = checked.size;
  const allChecked = count === games.length;
  const some = count > 0 && !allChecked;

  useEffect(() => {
    if (allBox.current) allBox.current.indeterminate = some;
  }, [some]);

  const toggle = (id: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const onSave = async () => {
    setSaving(true);
    setFailed(false);
    try {
      const saved = await exportGames(
        buildGamesFile(games.filter((g) => checked.has(g.id))),
      );
      if (saved) dialog.current?.close();
    } catch (err) {
      console.error(err);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="export-dialog"
      aria-labelledby="export-title"
      onClose={onClose}
    >
      <h3 id="export-title">{strings.share.exportTitle}</h3>
      <p className="hint">{strings.share.exportHint}</p>
      <div className="choices">
        <label className="all">
          <input
            ref={allBox}
            type="checkbox"
            checked={allChecked}
            onChange={() =>
              setChecked(
                allChecked ? new Set() : new Set(games.map((g) => g.id)),
              )
            }
          />
          {strings.share.all(count, games.length)}
        </label>
        {games.map((g) => (
          <label key={g.id}>
            <input
              type="checkbox"
              checked={checked.has(g.id)}
              onChange={() => toggle(g.id)}
            />
            {g.name}
          </label>
        ))}
      </div>
      {failed && (
        <p className="error" role="alert">
          {strings.share.exportFailed}
        </p>
      )}
      <div className="footer">
        <button type="button" onClick={() => dialog.current?.close()}>
          {strings.share.cancel}
        </button>
        <button
          type="button"
          className="primary"
          disabled={count === 0 || saving}
          onClick={onSave}
        >
          {strings.share.saveFile}
        </button>
      </div>
    </dialog>
  );
}
