import type { Ref } from "react";
import { strings } from "../strings";

type Props = {
  ref?: Ref<HTMLDivElement>;
  id: string;
  name: string;
  synopsis: string;
  // Offset from the top of the aside, in its own scrolling coordinates.
  top: number;
  // True to sit above the anchor instead of below it.
  above?: boolean;
};

// Lives inside the aside: game webviews are drawn above the ui webview, so
// anything over the game panel would be hidden.
export function SynopsisBubble({ ref, id, name, synopsis, top, above }: Props) {
  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className={above ? "synopsis-bubble above" : "synopsis-bubble"}
      style={{ top }}
    >
      <strong>{name}</strong>
      <p>{synopsis}</p>
      <span className="source">{strings.pick.source}</span>
    </div>
  );
}
