import { Link } from "@tanstack/react-router";
import {
  Check,
  Circle,
  CircleCheck,
  CircleMinus,
  RotateCw,
  ShieldOff,
  SkipForward,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "../app/IconButton";
import { useRoutine } from "../app/RoutineProvider";
import { SidebarResizer } from "../app/SidebarResizer";
import { clampSidebarWidth } from "../app/sidebarWidth";
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
  todo: Circle,
  finished: CircleCheck,
  ignored: CircleMinus,
} as const;

function boundsOf(el: HTMLElement): PanelBounds {
  const { x, y, width, height } = el.getBoundingClientRect();
  return { x, y, width, height };
}

export function RoutinePage() {
  const {
    state,
    dispatch,
    answer,
    busy,
    gameStreaks,
    dayStreak,
    sidebarWidth,
    saveSidebarWidth,
  } = useRoutine();
  // Live width during a drag; null means the stored one.
  const [draftWidth, setDraftWidth] = useState<number | null>(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
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
    // One update per frame: gameViews serialises every call, so a drag
    // would otherwise queue one IPC round trip per pixel.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setGameBounds(boundsOf(panel)).catch(console.error);
      });
    });
    observer.observe(panel);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
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

  const width = clampSidebarWidth(draftWidth ?? sidebarWidth, windowWidth);

  return (
    <div className="routine">
      <aside style={{ width }}>
        <h2>{strings.aside.title}</h2>
        <ol>
          {state.order.map((g, i) => {
            const status: DayStatus | "todo" =
              state.statuses.get(g.id) ?? "todo";
            const StateIcon = STATE_ICON[status];
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
                    <StateIcon size={16} />
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
      <SidebarResizer
        width={width}
        onDrag={(w) => setDraftWidth(clampSidebarWidth(w, window.innerWidth))}
        onCommit={(w) => {
          const next = clampSidebarWidth(w, window.innerWidth);
          setDraftWidth(null);
          saveSidebarWidth(next).catch(console.error);
        }}
      />
      <main>
        <header className="panel-header">
          <div className="game-title">
            <strong>{game.name}</strong>
            <span>{game.url}</span>
          </div>
          <span>{strings.routine.position(state.current + 1, total)}</span>
          <IconButton
            label={strings.routine.reload}
            icon={RotateCw}
            onClick={() =>
              reloadGame(game.id, game.url, true).catch(console.error)
            }
          />
          <IconButton
            label={strings.routine.reloadUnblocked}
            icon={ShieldOff}
            onClick={() =>
              reloadGame(game.id, game.url, false).catch(console.error)
            }
          />
          <IconButton
            label={strings.routine.ignore}
            icon={SkipForward}
            aria-pressed={currentStatus === "ignored"}
            disabled={busy}
            onClick={(e) => {
              // A double click would answer the next game too.
              if (e.detail > 1) return;
              answer("ignored").catch(console.error);
            }}
          />
          <IconButton
            label={strings.routine.finished}
            icon={Check}
            className="primary"
            aria-pressed={currentStatus === "finished"}
            disabled={busy}
            onClick={(e) => {
              // A double click would answer the next game too.
              if (e.detail > 1) return;
              answer("finished").catch(console.error);
            }}
          />
        </header>
        <div className="panel" ref={panelRef} />
      </main>
    </div>
  );
}
