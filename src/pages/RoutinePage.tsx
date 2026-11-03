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
import { strings } from "../strings";

function boundsOf(el: HTMLElement): PanelBounds {
  const { x, y, width, height } = el.getBoundingClientRect();
  return { x, y, width, height };
}

export function RoutinePage() {
  const { state, dispatch } = useRoutine();
  const panelRef = useRef<HTMLDivElement>(null);
  const game = state.order[state.current];
  const total = state.order.length;
  const isLast = state.current >= total - 1;

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
          {state.order.map((g, i) => (
            <li key={g.id}>
              <button
                type="button"
                className={state.opened.has(g.id) ? "opened" : undefined}
                aria-current={i === state.current ? "true" : undefined}
                onClick={() => dispatch({ type: "select", index: i })}
              >
                {g.name}
              </button>
            </li>
          ))}
        </ol>
        <p>{strings.aside.counter(state.opened.size, total)}</p>
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
            className="primary"
            disabled={isLast}
            onClick={() => dispatch({ type: "next" })}
          >
            {isLast ? strings.routine.done : strings.routine.next}
          </button>
        </header>
        <div className="panel" ref={panelRef} />
      </main>
    </div>
  );
}
