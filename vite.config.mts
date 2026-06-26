import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: "./",
  root: "src/renderer",
  css: {
    devSourcemap: false,
  },
  resolve: {
    alias: { "@": resolve(rootDir, "src") },
  },
  build: {
    outDir: "../../dist-renderer",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/views/Studio")) return "studio";
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      overlay: false,
    },
  },
});
