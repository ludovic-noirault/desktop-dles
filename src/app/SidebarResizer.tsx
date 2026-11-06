import type { PointerEvent } from "react";
import { strings } from "../strings";
import { clampSidebarWidth, DEFAULT_SIDEBAR_WIDTH } from "./sidebarWidth";

type Props = {
  width: number;
  onDrag(width: number): void;
  onCommit(width: number): void;
};

export function SidebarResizer({ width, onDrag, onCommit }: Props) {
  // The aside starts at the container's left edge.
  const widthAt = (e: PointerEvent<HTMLDivElement>) =>
    clampSidebarWidth(
      e.clientX -
        (e.currentTarget.parentElement?.getBoundingClientRect().left ?? 0),
      window.innerWidth,
    );

  return (
    // biome-ignore lint/a11y/useSemanticElements: a separator with a value is a widget, not an <hr>
    <div
      className="sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={strings.aside.resize}
      aria-valuenow={width}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) onDrag(widthAt(e));
      }}
      onPointerUp={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        onCommit(widthAt(e));
      }}
      onDoubleClick={() => onCommit(DEFAULT_SIDEBAR_WIDTH)}
    />
  );
}
