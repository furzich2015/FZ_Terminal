import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "chrome150",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@xterm")) return "terminal";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/zustand")) return "state";
          if (id.includes("node_modules/react")) return "react";
        },
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
