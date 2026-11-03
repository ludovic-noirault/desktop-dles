import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { AppShell } from "./app/AppShell";
import { RoutinePage } from "./pages/RoutinePage";
import { SettingsPage } from "./pages/SettingsPage";

const rootRoute = createRootRoute({ component: AppShell });
const routineRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: RoutinePage,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([routineRoute, settingsRoute]),
  history: createHashHistory(),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
