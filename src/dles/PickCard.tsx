import { Plus, Shuffle, Sparkles } from "lucide-react";
import type { Ref } from "react";
import { IconButton } from "../app/IconButton";
import type { StoredPick } from "../storage/pickRepo";
import { strings } from "../strings";
import { useRefocus } from "./useRefocus";

type Props = {
  ref?: Ref<HTMLElement>;
  pick: StoredPick;
  busy: boolean;
  trying: boolean;
  describedBy?: string;
  onTry(): void;
  onAdd(): void;
  onAnother(): void;
  onFocusIn(): void;
  onFocusOut(): void;
};

export function PickCard({
  ref,
  pick,
  busy,
  trying,
  describedBy,
  onTry,
  onAdd,
  onAnother,
  onFocusIn,
  onFocusOut,
}: Props) {
  const another = useRefocus(busy);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus-within only toggle a tooltip, the card has no action of its own
    <section
      ref={ref}
      className={trying ? "pick-card selected" : "pick-card"}
      onMouseEnter={onFocusIn}
      onMouseLeave={onFocusOut}
      onFocus={onFocusIn}
      onBlur={onFocusOut}
    >
      <p className="pick-label">
        <Sparkles aria-hidden="true" size={14} />
        {strings.pick.title}
      </p>
      <button
        type="button"
        className="pick-name"
        aria-label={strings.pick.tryLabel(pick.name)}
        aria-pressed={trying}
        onClick={onTry}
      >
        {pick.name}
      </button>
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
          ref={another.ref}
          disabled={busy}
          aria-describedby={describedBy}
          onClick={(e) => {
            another.mark(e);
            onAnother();
          }}
        />
      </div>
    </section>
  );
}
