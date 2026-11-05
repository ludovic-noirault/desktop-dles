import { Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useRoutine } from "../app/RoutineProvider";
import {
  hideGames,
  type PanelBounds,
  reloadGame,
  setGameBounds,
  showGame,
} from "../games/gameViews";
import { isRoutineDone } from "../routine/routine";
import type { DayStatus } from "../routine/types";
import { strings } from "../strings";

const STATE_ICON = {
  todo: "\u25CB",
  finished: "\u2713",
  ignored: "\u21E5",
} as const;

function boundsOf(el: HTMLElement): PanelBounds {
  const { x, y, width, height } = el.getBoundingClientRect();
  return { x, y, width, height };
}

export function RoutinePage() {
  const { state, dispatch, answer, busy, gameStreaks, dayStreak } =
    useRoutine();
  const panelRef = useRef<HTMLDivElement>(null);
  const game = state.order[state.current];
  const total = state.order.length;
  const currentStatus = game ? state.statuses.get(game.id) : undefined;
  const finishedCount = state.order.filter(
    (g) => state.statuses.get(g.id) === "finished",
  ).length;

  // Never awaited: the native webview loads on its own.
  useEffect(() => {
    if (!game || !panelRef.current) {
      hideGames().catch(console.error);
      return;
    }
    showGame(game.id, game.url, boundsOf(panelRef.current)).catch(
      console.error,
    );
  }, [game]);

  // Separate from the effect above so switching games does not hide first.
  // gameViews runs commands in call order, so under StrictMode the last show wins.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(() =>
      setGameBounds(boundsOf(panel)).catch(console.error),
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => void hideGames().catch(console.error), []);

  if (!game) {
    return (
      <main className="empty">
        <p>{strings.routine.empty}</p>
        <Link to="/settings">{strings.routine.emptyLink}</Link>
      </main>
    );
  }

  return (
    <div className="routine">
      <aside>
        <h2>{strings.aside.title}</h2>
        <ol>
          {state.order.map((g, i) => {
            const status: DayStatus | "todo" =
              state.statuses.get(g.id) ?? "todo";
            const streak = gameStreaks.get(g.id) ?? 0;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  className={status}
                  aria-current={i === state.current ? "true" : undefined}
                  onClick={() => dispatch({ type: "select", index: i })}
                >
                  <span className="icon" aria-hidden="true">
                    {STATE_ICON[status]}
                  </span>
                  <span className="sr-only">
                    {strings.aside.status[status]}:{" "}
                  </span>
                  <span className="name">{g.name}</span>
                  <span className="streak" aria-hidden="true">
                    {streak}
                  </span>
                  <span className="sr-only">
                    {strings.aside.gameStreak(streak)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <footer>
          <p className="aside-note">
            {isRoutineDone(state)
              ? strings.aside.done
              : strings.aside.counter(finishedCount, total)}
          </p>
          <p className="aside-note">{strings.aside.dayStreak(dayStreak)}</p>
        </footer>
      </aside>
      <main>
        <header className="panel-header">
          <div className="game-title">
            <strong>{game.name}</strong>
            <span>{game.url}</span>
          </div>
          <span>{strings.routine.position(state.current + 1, total)}</span>
          <button
            type="button"
            onClick={() => reloadGame(game.id, game.url).catch(console.error)}
          >
            {strings.routine.reload}
          </button>
          <button
            type="button"
            aria-pressed={currentStatus === "ignored"}
            disabled={busy}
            onClick={() => answer("ignored").catch(console.error)}
          >
            {strings.routine.ignore}
          </button>
          <button
            type="button"
            className="primary"
            aria-pressed={currentStatus === "finished"}
            disabled={busy}
            onClick={() => answer("finished").catch(console.error)}
          >
            {strings.routine.finished}
          </button>
        </header>
        <div className="panel" ref={panelRef} />
      </main>
    </div>
  );
}
