import { type PointerEvent, useRef } from "react";
import { strings } from "../strings";
import { clampSidebarWidth, DEFAULT_SIDEBAR_WIDTH } from "./sidebarWidth";

type Props = {
  width: number;
  onDrag(width: number): void;
  onCommit(width: number): void;
};

export function SidebarResizer({ width, onDrag, onCommit }: Props) {
  // Set while a drag runs. `moved` stays false for a plain click, which must
  // not save the pointer position as a width.
  const drag = useRef<{ moved: boolean; width: number } | null>(null);

  // The aside starts at the container's left edge.
  const widthAt = (e: PointerEvent<HTMLDivElement>) =>
    clampSidebarWidth(
      e.clientX -
        (e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0),
      window.innerWidth,
    );

  const finish = (e: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;
    if (!current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (current.moved) onCommit(current.width);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a separator with a value is a widget, not an <hr>
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={strings.aside.resize}
      aria-valuenow={width}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { moved: false, width };
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        drag.current = { moved: true, width: widthAt(e) };
        onDrag(drag.current.width);
      }}
      // Capture can be lost without a pointerup (cancel, window change): the
      // width on screen must still be saved. The later events find no drag.
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onDoubleClick={() => onCommit(DEFAULT_SIDEBAR_WIDTH)}
    />
  );
}
