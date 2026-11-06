import { Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { strings } from "../strings";

export function AppShell() {
  // Without this, a file dropped outside a drop zone navigates the webview to it.
  // A drop zone handles its own drop before the event reaches `window`.
  useEffect(() => {
    const prevent = (event: Event) => event.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <h1>{strings.appName}</h1>
        <nav>
          <Link to="/" activeProps={{ "aria-current": "page" }}>
            {strings.nav.routine}
          </Link>
          <Link to="/settings" activeProps={{ "aria-current": "page" }}>
            {strings.nav.settings}
          </Link>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
