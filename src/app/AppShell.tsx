import { Link, Outlet } from "@tanstack/react-router";
import { strings } from "../strings";

export function AppShell() {
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
