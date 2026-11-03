import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects a fixed dev port, so a busy port must fail rather than shift.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
