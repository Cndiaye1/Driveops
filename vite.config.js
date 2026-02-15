import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  envDir: path.resolve(process.cwd(), ".vercel"),
  server: command === "serve" ? {
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true, secure: false },
    },
  } : undefined,
}));
