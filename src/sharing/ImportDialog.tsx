import { useEffect, useMemo, useRef, useState } from "react";
import { getDb, useRoutine } from "../app/RoutineProvider";
import { dayKey } from "../routine/day";
import type { Game } from "../routine/types";
import { addGames } from "../storage/gamesRepo";
import { strings } from "../strings";
import {
  classifyEntries,
  type ReadError,
  readGamesFile,
  type SharedGame,
} from "./gamesFile";

export function ImportDialog({
  games,
  onClose,
}: {
  games: Game[];
  onClose: () => void;
}) {
  const { refresh } = useRoutine();
  const dialog = useRef<HTMLDialogElement>(null);
  const [readError, setReadError] = useState<ReadError | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [entries, setEntries] = useState<SharedGame[] | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const [failed, setFailed] = useState(false);
  // Set when a refresh failed: the classification may be stale, so adding stays off.
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const load = async (file: File) => {
    const result = await readGamesFile(file);
    if (!result.ok) {
      setReadError(result.error);
      return;
    }
    setReadError(null);
    setFileName(file.name);
    setEntries(result.entries);
    setChecked(
      new Set(
        classifyEntries(result.entries, games).flatMap((r, i) =>
          r.status === "new" ? [i] : [],
        ),
      ),
    );
  };

  const toggle = (i: number) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });

  // Re-derived from the live list, so rows already inserted show as present.
  const rows = useMemo(
    () => (entries ? classifyEntries(entries, games) : null),
    [entries, games],
  );
  const picked = rows
    ? rows.filter((r, i) => r.status === "new" && checked.has(i))
    : [];
  const count = picked.length;

  const onAdd = async () => {
    setAdding(true);
    setFailed(false);
    try {
      await addGames(await getDb(), picked, dayKey(new Date()));
      await refresh();
      dialog.current?.close();
    } catch (err) {
      console.error(err);
      setFailed(true);
      try {
        await refresh();
      } catch (refreshErr) {
        console.error(refreshErr);
        setStale(true);
      }
    } finally {
      setAdding(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="export-dialog import-dialog"
      aria-labelledby="import-title"
      onClose={onClose}
      onCancel={(e) => adding && e.preventDefault()}
    >
      <h3 id="import-title">{strings.share.importTitle}</h3>
      {rows ? (
        <>
          <p className="hint">
            {strings.share.fromFile(fileName, rows.length)}
          </p>
          <div className="choices">
            {rows.map((r, i) => (
              <label
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are fixed once the file is read
                key={i}
                className={r.status === "new" ? undefined : "dim"}
              >
                <input
                  type="checkbox"
                  checked={checked.has(i) && r.status === "new"}
                  disabled={r.status !== "new" || adding}
                  onChange={() => toggle(i)}
                />
                <span className="row-name">{r.name}</span>
                {r.status === "present" && (
                  <span className="tag">{strings.share.alreadyPresent}</span>
                )}
                {r.status === "invalid" && (
                  <span className="tag">{strings.share.invalidEntry}</span>
                )}
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="hint">{strings.share.importHint}</p>
          {readError && (
            <p className="error" role="alert">
              {strings.share.readErrors[readError]}
            </p>
          )}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: drag and drop is a pointer shortcut, the file input is the keyboard path */}
          <div
            className={dragging ? "drop-zone over" : "drop-zone"}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) void load(file);
            }}
          >
            <span>{strings.share.dropHere}</span>
            <label className="choose">
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void load(file);
                }}
              />
              {strings.share.chooseFile}
            </label>
          </div>
        </>
      )}
      {failed && (
        <p className="error" role="alert">
          {strings.share.importFailed}
        </p>
      )}
      <div className="footer">
        <button
          type="button"
          disabled={adding}
          onClick={() => dialog.current?.close()}
        >
          {strings.share.cancel}
        </button>
        {rows && (
          <button
            type="button"
            className="primary"
            disabled={count === 0 || adding || stale}
            onClick={onAdd}
          >
            {strings.share.addGames(count)}
          </button>
        )}
      </div>
    </dialog>
  );
}
