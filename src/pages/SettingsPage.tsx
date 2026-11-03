import { type FormEvent, useRef, useState } from "react";
import { getDb, useRoutine } from "../app/RoutineProvider";
import { closeGame } from "../games/gameViews";
import { isValidGameUrl, moveGame } from "../routine/routine";
import {
  addGame,
  deleteGame,
  saveOrder,
  setShuffle,
} from "../storage/gamesRepo";
import { strings } from "../strings";

const log = (err: unknown) => console.error(err);

export function SettingsPage() {
  const { games, shuffle, refresh } = useRoutine();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);

  const [busy, setBusy] = useState(false);
  // The ref blocks a second click in the same tick, before `busy` re-renders.
  const inFlight = useRef(false);

  const write = async (
    change: (db: Awaited<ReturnType<typeof getDb>>) => Promise<void>,
  ): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    try {
      await change(await getDb());
      await refresh();
      return true;
    } catch (err) {
      log(err);
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidGameUrl(url)) {
      setError(true);
      return;
    }
    setError(false);
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
                  await closeGame(g.id).catch(log);
                })
              }
            >
              ✕
            </button>
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
