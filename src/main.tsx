import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RoutineProvider } from "./app/RoutineProvider";
import { router } from "./router";
import { StartupGate } from "./startup/StartupGate";
import "./styles.css";

// Without this, a file dropped outside a drop zone navigates the webview to it. It lives here,
// not in a component, because the splash, offline and update screens render above the router.
// A drop zone handles its own drop before the event reaches `window`. Only file drags are
// blocked, so text and link drops into inputs keep working.
const preventFileDrag = (event: DragEvent) => {
  if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
};
window.addEventListener("dragover", preventFileDrag);
window.addEventListener("drop", preventFileDrag);

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <StartupGate>
      <RoutineProvider>
        <RouterProvider router={router} />
      </RoutineProvider>
    </StartupGate>
  </StrictMode>,
);
