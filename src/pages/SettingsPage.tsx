import { type FormEvent, useEffect, useRef, useState } from "react";
import { getDb, useRoutine } from "../app/RoutineProvider";
import { closeGame } from "../games/gameViews";
import { isValidGameUrl, moveGame } from "../routine/routine";
import type { Game } from "../routine/types";
import type { Db } from "../storage/db";
import {
  addGame,
  deleteGame,
  saveOrder,
  setShuffle,
  updateGame,
} from "../storage/gamesRepo";
import { strings } from "../strings";

export function SettingsPage() {
  const { games, shuffle, refresh } = useRoutine();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editError, setEditError] = useState(false);
  const editNameInput = useRef<HTMLInputElement>(null);
  const editButtons = useRef(new Map<number, HTMLButtonElement>());
  const lastEdited = useRef<number | null>(null);

  const [busy, setBusy] = useState(false);
  // The ref blocks a second click in the same tick, before `busy` re-renders.
  const inFlight = useRef(false);

  const write = async (change: (db: Db) => Promise<void>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    try {
      await change(await getDb());
      await refresh();
      return true;
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (editingId !== null) editNameInput.current?.focus();
    else if (lastEdited.current !== null)
      editButtons.current.get(lastEdited.current)?.focus();
  }, [editingId]);

  const checkUrl = (value: string, setInvalid: (invalid: boolean) => void) => {
    const valid = isValidGameUrl(value);
    setInvalid(!valid);
    return valid;
  };

  const startEdit = (g: Game) => {
    setEditingId(g.id);
    setEditName(g.name);
    setEditUrl(g.url);
    setEditError(false);
  };

  const stopEdit = () => {
    lastEdited.current = editingId;
    setEditingId(null);
  };

  const onSave = (e: FormEvent, g: Game) => {
    e.preventDefault();
    if (!editName.trim() || !checkUrl(editUrl, setEditError)) return;
    const urlChanged = editUrl.trim() !== g.url;
    write(async (db) => {
      await updateGame(db, g.id, editName, editUrl);
      if (urlChanged) await closeGame(g.id).catch(console.error);
    }).then((ok) => {
      if (ok) stopEdit();
    });
  };

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!checkUrl(url, setError)) return;
    write(async (db) => {
      await addGame(db, name, url);
    }).then((ok) => {
      if (ok) {
        setName("");
        setUrl("");
      }
    });
  };

  return (
    <main className="settings">
      <h2>{strings.settings.title}</h2>
      <ul>
        {games.map((g, i) => (
          <li key={g.id}>
            {editingId === g.id ? (
              <form
                className="edit-form"
                onSubmit={(e) => onSave(e, g)}
                onKeyDown={(e) => e.key === "Escape" && !busy && stopEdit()}
                noValidate
              >
                <input
                  ref={editNameInput}
                  required
                  value={editName}
                  disabled={busy}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={strings.settings.namePlaceholder}
                  aria-label={strings.settings.namePlaceholder}
                />
                <input
                  required
                  type="url"
                  value={editUrl}
                  disabled={busy}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder={strings.settings.urlPlaceholder}
                  aria-label={strings.settings.urlPlaceholder}
                  aria-invalid={editError}
                />
                <button type="submit" disabled={busy || !editName.trim()}>
                  {strings.settings.save}
                </button>
                <button type="button" disabled={busy} onClick={stopEdit}>
                  {strings.settings.cancel}
                </button>
                {editError && <p role="alert">{strings.settings.invalidUrl}</p>}
              </form>
            ) : (
              <>
                <span className="game-title">
                  <strong>{g.name}</strong>
                  <span>{g.url}</span>
                </span>
                <button
                  type="button"
                  aria-label={strings.settings.moveUp(g.name)}
                  disabled={busy || i === 0}
                  onClick={() =>
                    write((db) => saveOrder(db, moveGame(games, g.id, "up")))
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={strings.settings.moveDown(g.name)}
                  disabled={busy || i === games.length - 1}
                  onClick={() =>
                    write((db) => saveOrder(db, moveGame(games, g.id, "down")))
                  }
                >
                  ↓
                </button>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={strings.settings.remove(g.name)}
                  onClick={() =>
                    write(async (db) => {
                      await deleteGame(db, g.id);
                      await closeGame(g.id).catch(console.error);
                    })
                  }
                >
                  ✕
                </button>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) editButtons.current.set(g.id, el);
                    else editButtons.current.delete(g.id);
                  }}
                  disabled={busy}
                  aria-label={strings.settings.editGame(g.name)}
                  onClick={() => startEdit(g)}
                >
                  {strings.settings.edit}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <form onSubmit={onAdd} noValidate>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={strings.settings.namePlaceholder}
          aria-label={strings.settings.namePlaceholder}
        />
        <input
          required
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={strings.settings.urlPlaceholder}
          aria-label={strings.settings.urlPlaceholder}
          aria-invalid={error}
        />
        <button type="submit" disabled={busy || !name.trim()}>
          {strings.settings.add}
        </button>
        {error && <p role="alert">{strings.settings.invalidUrl}</p>}
      </form>

      <label className="shuffle">
        <input
          type="checkbox"
          checked={shuffle}
          disabled={busy}
          onChange={(e) => write((db) => setShuffle(db, e.target.checked))}
        />
        {strings.settings.shuffle}
      </label>
    </main>
  );
}
