import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(__dirname, "e2e-tests/fixtures"),
  publicDir: path.resolve(__dirname, "public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, ".performance-dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "e2e-tests/fixtures/performance.html"),
    },
  },
});
