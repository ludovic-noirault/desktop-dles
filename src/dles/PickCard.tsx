import { Plus, Shuffle, Sparkles } from "lucide-react";
import { type Ref, useEffect, useRef } from "react";
import { IconButton } from "../app/IconButton";
import type { StoredPick } from "../storage/pickRepo";
import { strings } from "../strings";

type Props = {
  ref?: Ref<HTMLElement>;
  pick: StoredPick;
  busy: boolean;
  describedBy?: string;
  onAdd(): void;
  onAnother(): void;
  onFocusIn(): void;
  onFocusOut(): void;
};

export function PickCard({
  ref,
  pick,
  busy,
  describedBy,
  onAdd,
  onAnother,
  onFocusIn,
  onFocusOut,
}: Props) {
  const anotherRef = useRef<HTMLButtonElement>(null);
  // A disabled button drops focus, so keyboard users would land on the body
  // after "Another one". Remember it had focus and give it back when busy ends.
  const refocus = useRef(false);
  useEffect(() => {
    if (busy || !refocus.current) return;
    refocus.current = false;
    anotherRef.current?.focus();
  }, [busy]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus-within only toggle a tooltip, the card has no action of its own
    <section
      ref={ref}
      className="pick-card"
      onMouseEnter={onFocusIn}
      onMouseLeave={onFocusOut}
      onFocus={onFocusIn}
      onBlur={onFocusOut}
    >
      <p className="pick-label">
        <Sparkles aria-hidden="true" size={14} />
        {strings.pick.title}
      </p>
      <strong className="pick-name">{pick.name}</strong>
      {pick.category && <span className="pick-category">{pick.category}</span>}
      <div className="pick-actions">
        <IconButton
          label={strings.pick.add}
          icon={Plus}
          className="primary"
          disabled={busy}
          aria-describedby={describedBy}
          onClick={() => onAdd()}
        />
        <IconButton
          label={strings.pick.another}
          icon={Shuffle}
          ref={anotherRef}
          disabled={busy}
          aria-describedby={describedBy}
          onClick={(e) => {
            refocus.current = document.activeElement === e.currentTarget;
            onAnother();
          }}
        />
      </div>
    </section>
  );
}
