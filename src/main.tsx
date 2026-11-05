import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RoutineProvider } from "./app/RoutineProvider";
import { router } from "./router";
import { StartupGate } from "./startup/StartupGate";
import "./styles.css";

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
