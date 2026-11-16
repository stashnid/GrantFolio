import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "frontend",
  envDir: "..",
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:18080" } },
  build: {
    outDir: "dist", emptyOutDir: true,
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes("node_modules/@firebase/") || id.includes("node_modules/firebase/")) return "firebase";
      if (id.includes("node_modules/react") || id.includes("node_modules/scheduler/")) return "react";
    } } },
  },
});
