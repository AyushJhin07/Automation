import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import tsconfigPaths from "vite-tsconfig-paths";

if (
  typeof process.env.ENABLE_DEV_IGNORE_QUEUE === "string" &&
  typeof process.env.VITE_ENABLE_DEV_IGNORE_QUEUE !== "string"
) {
  process.env.VITE_ENABLE_DEV_IGNORE_QUEUE = process.env.ENABLE_DEV_IGNORE_QUEUE;
}

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tsconfigPaths({
      projects: [path.resolve(import.meta.dirname, "client", "tsconfig.json")],
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
});
