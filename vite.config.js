// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(() => {
  const isVercel = !!process.env.VERCEL;

  return {
    plugins: [
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler"]],
        },
      }),
    ],

    // ✅ Vercel dev => variables dans .vercel/.env.development.local
    envDir: isVercel ? path.resolve(process.cwd(), ".vercel") : process.cwd(),

    // ✅ Quand tu fais "npm run dev" (Vite:5173) + "vercel dev" (API:3000)
    // on proxy /api vers Vercel
    server: !isVercel
      ? {
          proxy: {
            "/api": {
              target: "http://localhost:3000",
              changeOrigin: true,
              secure: false,
            },
          },
        }
      : undefined,
  };
});
