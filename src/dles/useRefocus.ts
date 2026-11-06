import { type MouseEvent, useEffect, useRef } from "react";

// A disabled button drops focus, so keyboard users would land on the body after
// an async action. `mark` remembers the button had focus when clicked and the
// effect gives it back once `busy` ends.
export function useRefocus(busy: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  const had = useRef(false);
  useEffect(() => {
    if (busy || !had.current) return;
    had.current = false;
    ref.current?.focus();
  }, [busy]);
  const mark = (e: MouseEvent<HTMLButtonElement>) => {
    had.current = document.activeElement === e.currentTarget;
  };
  return { ref, mark };
}
