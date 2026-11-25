// @ts-ignore
// @ts-ignore

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import process from "node:process";
import tailwindcss from '@tailwindcss/vite'

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev
export default defineConfig(({ command }) => {
  const isBuild = command === "build";

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
    build: {
      chunkSizeWarningLimit: 2000,
      // 生产环境关闭 sourcemap 减小打包体积，开发环境开启便于调试
      sourcemap: !isBuild,
      // 生产打包时通过 Rolldown / Oxc 压缩配置移除 console 与 debugger
      rolldownOptions: isBuild
        ? {
          output: {
            minify: {
              compress: {
                dropConsole: true,
                dropDebugger: true,
              },
            },
          },
        }
        : undefined,
    },
    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
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
  };
});
