import { Plus, Shuffle, Sparkles } from "lucide-react";
import { forwardRef } from "react";
import { IconButton } from "../app/IconButton";
import type { StoredPick } from "../storage/pickRepo";
import { strings } from "../strings";

type Props = {
  pick: StoredPick;
  busy: boolean;
  describedBy?: string;
  onAdd(): void;
  onAnother(): void;
  onFocusIn(): void;
  onFocusOut(): void;
};

export const PickCard = forwardRef<HTMLElement, Props>(function PickCard(
  { pick, busy, describedBy, onAdd, onAnother, onFocusIn, onFocusOut },
  ref,
) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover and focus-within only toggle a tooltip, the card has no action of its own
    <section
      ref={ref}
      className="pick-card"
      aria-describedby={describedBy}
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
          onClick={() => onAdd()}
        />
        <IconButton
          label={strings.pick.another}
          icon={Shuffle}
          disabled={busy}
          onClick={() => onAnother()}
        />
      </div>
    </section>
  );
});
