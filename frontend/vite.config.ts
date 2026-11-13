import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "frontend",
  envDir: "..",
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:18080" } },
  build: { outDir: "dist", emptyOutDir: true },
});
