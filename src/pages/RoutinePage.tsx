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
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "../app/IconButton";
import { useRoutine } from "../app/RoutineProvider";
import { SidebarResizer } from "../app/SidebarResizer";
import { clampSidebarWidth } from "../app/sidebarWidth";
import { gameUrlKey } from "../dles/catalog";
import { PickCard } from "../dles/PickCard";
import { SynopsisBubble } from "../dles/SynopsisBubble";
import { useDailyPick } from "../dles/useDailyPick";
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

const BUBBLE_ID = "synopsis-bubble";

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
  const cardRef = useRef<HTMLElement>(null);
  const { pick, info, busy: pickBusy, add, another } = useDailyPick();
  // Which synopsis bubble shows: a routine row, the pick card, or none.
  const [bubble, setBubble] = useState<{
    key: string;
    top: number;
    above: boolean;
    // Top of the anchor, where the bubble goes once flipped above it.
    anchorTop: number;
  } | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
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
    // One call in flight, latest bounds win: gameViews serialises every call,
    // so a drag would otherwise queue one IPC round trip per frame whenever a
    // round trip outlasts a frame.
    let frame = 0;
    let inFlight = false;
    let pending: PanelBounds | null = null;
    let cancelled = false;
    const send = (bounds: PanelBounds) => {
      inFlight = true;
      setGameBounds(bounds)
        .catch(console.error)
        .finally(() => {
          inFlight = false;
          if (pending && !cancelled) {
            const next = pending;
            pending = null;
            send(next);
          }
        });
    };
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const bounds = boundsOf(panel);
        if (inFlight) pending = bounds;
        else send(bounds);
      });
    });
    observer.observe(panel);
    return () => {
      cancelled = true;
      pending = null;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  // A row near the bottom of a scrolled list would push its bubble out of the
  // aside: flip it above the row once its real height is known.
  useLayoutEffect(() => {
    const aside = asideRef.current;
    const el = bubbleRef.current;
    if (!bubble || bubble.above || !aside || !el) return;
    if (el.offsetTop + el.offsetHeight > aside.scrollTop + aside.clientHeight) {
      setBubble({ ...bubble, above: true, top: bubble.anchorTop });
    }
  }, [bubble]);

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

  // The pick keeps the synopsis it was stored with; routine rows use the cache.
  const bubbleGame = bubble?.key.startsWith("row:")
    ? state.order.find((g) => `row:${g.id}` === bubble.key)
    : undefined;
  const bubbleText = bubble
    ? bubble.key === "pick"
      ? pick && { name: pick.name, synopsis: pick.synopsis }
      : bubbleGame && {
          name: bubbleGame.name,
          synopsis: info.get(gameUrlKey(bubbleGame.url) ?? "")?.synopsis,
        }
    : null;

  // offsetTop is relative to the aside (its positioned ancestor), so the
  // bubble follows the row when the list scrolls.
  const showBubble = (key: string, el: HTMLElement, above = false) =>
    setBubble({
      key,
      top: above ? el.offsetTop : el.offsetTop + el.offsetHeight,
      above,
      anchorTop: el.offsetTop,
    });
  const hideBubble = () => setBubble(null);

  const width = clampSidebarWidth(draftWidth ?? sidebarWidth, windowWidth);

  return (
    <div className="routine">
      <aside ref={asideRef} style={{ width }}>
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
                  aria-describedby={
                    bubble?.key === `row:${g.id}` && bubbleText?.synopsis
                      ? BUBBLE_ID
                      : undefined
                  }
                  onMouseEnter={(e) =>
                    showBubble(`row:${g.id}`, e.currentTarget)
                  }
                  onFocus={(e) => showBubble(`row:${g.id}`, e.currentTarget)}
                  onMouseLeave={hideBubble}
                  onBlur={hideBubble}
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
        {pick && (
          <PickCard
            ref={cardRef}
            pick={pick}
            busy={pickBusy}
            describedBy={
              bubble?.key === "pick" && bubbleText?.synopsis
                ? BUBBLE_ID
                : undefined
            }
            onAdd={() => add().catch(console.error)}
            onAnother={() => another().catch(console.error)}
            onFocusIn={() =>
              cardRef.current && showBubble("pick", cardRef.current, true)
            }
            onFocusOut={hideBubble}
          />
        )}
        {bubble && bubbleText?.synopsis && (
          <SynopsisBubble
            ref={bubbleRef}
            id={BUBBLE_ID}
            name={bubbleText.name}
            synopsis={bubbleText.synopsis}
            top={bubble.top}
            above={bubble.above}
          />
        )}
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
