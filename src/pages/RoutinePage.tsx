import { Link } from "@tanstack/react-router";
import {
  Check,
  Circle,
  CircleCheck,
  CircleMinus,
  Plus,
  RotateCw,
  ShieldOff,
  Shuffle,
  SkipForward,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "../app/IconButton";
import { useRoutine } from "../app/RoutineProvider";
import { SidebarResizer } from "../app/SidebarResizer";
import { clampSidebarWidth } from "../app/sidebarWidth";
import { gameUrlKey } from "../dles/catalog";
import { PickCard } from "../dles/PickCard";
import { indexOfGame } from "../dles/pick";
import { SynopsisBubble } from "../dles/SynopsisBubble";
import { useDailyPick } from "../dles/useDailyPick";
import {
  closeGame,
  hideGames,
  type PanelBounds,
  PICK_VIEW_ID,
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
  // Trying shows the pick in its own webview without touching the routine.
  const [trying, setTrying] = useState(false);
  const showTrial = trying && pick !== null;
  // URL loaded in `game-0`, null when that webview does not exist.
  const trialUrl = useRef<string | null>(null);
  // URL of a pick being added from the trial: select it once it is in the routine.
  const pendingSelect = useRef<string | null>(null);
  const pickUrl = pick?.url ?? null;
  const game = state.order[state.current];
  const total = state.order.length;
  const currentStatus = game ? state.statuses.get(game.id) : undefined;
  const finishedCount = state.order.filter(
    (g) => state.statuses.get(g.id) === "finished",
  ).length;

  // A pick that vanishes (added, day change, hidden) or is replaced ends its
  // trial: `game-0` is closed so a later pick never reuses the old page.
  // Declared before the panel effect so a close is queued before a new show.
  useEffect(() => {
    if (trialUrl.current !== null && trialUrl.current !== pickUrl) {
      trialUrl.current = null;
      closeGame(PICK_VIEW_ID).catch(console.error);
    }
    if (pickUrl === null) setTrying(false);
  }, [pickUrl]);

  // After "Add to routine" from the trial, the added game becomes current.
  useEffect(() => {
    const url = pendingSelect.current;
    if (!url) return;
    const index = indexOfGame(state.order, url);
    if (index < 0) return;
    pendingSelect.current = null;
    dispatch({ type: "select", index });
  }, [state.order, dispatch]);

  // Never awaited: the native webview loads on its own.
  useEffect(() => {
    if (!panelRef.current) return;
    if (trying && pickUrl) {
      trialUrl.current = pickUrl;
      showGame(PICK_VIEW_ID, pickUrl, boundsOf(panelRef.current)).catch(
        console.error,
      );
    } else if (game) {
      showGame(game.id, game.url, boundsOf(panelRef.current)).catch(
        console.error,
      );
    } else {
      hideGames().catch(console.error);
    }
  }, [game, trying, pickUrl]);

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

  // A trial does not survive leaving the page: game-0 would keep a stale URL.
  useEffect(
    () => () => {
      trialUrl.current = null;
      hideGames().catch(console.error);
      closeGame(PICK_VIEW_ID).catch(console.error);
    },
    [],
  );

  const tryPick = () => setTrying(true);
  const addPick = () => {
    if (trying && pick) pendingSelect.current = pick.url;
    add().catch((error) => {
      pendingSelect.current = null;
      console.error(error);
    });
  };

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
                  aria-current={
                    !showTrial && i === state.current ? "true" : undefined
                  }
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
                  onClick={() => {
                    setTrying(false);
                    dispatch({ type: "select", index: i });
                  }}
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
            trying={showTrial}
            describedBy={
              bubble?.key === "pick" && bubbleText?.synopsis
                ? BUBBLE_ID
                : undefined
            }
            onTry={tryPick}
            onAdd={addPick}
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
        {showTrial && pick ? (
          <header className="panel-header">
            <div className="game-title">
              <strong>{pick.name}</strong>
              <span>{strings.pick.trying}</span>
            </div>
            <IconButton
              label={strings.routine.reload}
              icon={RotateCw}
              onClick={() =>
                reloadGame(PICK_VIEW_ID, pick.url, true).catch(console.error)
              }
            />
            <IconButton
              label={strings.routine.reloadUnblocked}
              icon={ShieldOff}
              onClick={() =>
                reloadGame(PICK_VIEW_ID, pick.url, false).catch(console.error)
              }
            />
            <IconButton
              label={strings.pick.another}
              icon={Shuffle}
              disabled={pickBusy}
              onClick={() => another().catch(console.error)}
            />
            <IconButton
              label={strings.pick.add}
              icon={Plus}
              className="primary"
              disabled={pickBusy}
              onClick={addPick}
            />
          </header>
        ) : (
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
        )}
        <div className="panel" ref={panelRef} />
      </main>
    </div>
  );
}
