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

const log = (err: unknown) => console.error(err);

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
      hideGames().catch(log);
      return;
    }
    showGame(game.id, game.url, boundsOf(panelRef.current)).catch(log);
  }, [game]);

  // Separate from the effect above so switching games does not hide first.
  // gameViews runs commands in call order, so under StrictMode the last show wins.
  useEffect(() => {
    const panel = panelRef.current;
    const sync = () => {
      if (panelRef.current)
        setGameBounds(boundsOf(panelRef.current)).catch(log);
    };
    const observer = new ResizeObserver(sync);
    if (panel) observer.observe(panel);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => () => void hideGames().catch(log), []);

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
            onClick={() => reloadGame(game.id, game.url).catch(log)}
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
