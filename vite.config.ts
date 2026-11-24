// @ts-ignore
// @ts-ignore

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import process from "node:process";
import tailwindcss from '@tailwindcss/vite'

const host = process.env.TAURI_DEV_HOST;


// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [vue(),tailwindcss(),],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
