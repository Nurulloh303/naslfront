import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Dev-server: `/api` va `/media` Django'ga uzatiladi.
 *
 * Proksi tufayli brauzer uchun hammasi bitta manzil — http://127.0.0.1:5173.
 * Ya'ni CORS ham, cookie ham muammo bo'lmaydi, va bu prod'dagi tuzilishning
 * aynan o'zi (naslai.uz + nginx `/api` ni Django'ga uzatadi).
 *
 * `/media` ham shart: generatsiya natijalari `/media/...` da yotadi —
 * usiz kartalar rasmi 404 bo'ladi.
 *
 * 8787 — Django porti (README bo'yicha `runserver 127.0.0.1:8787`).
 * Boshqa port olsangiz, shu yerda ham o'zgartiring.
 */
const DJANGO_ORIGIN = "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": DJANGO_ORIGIN,
      "/media": DJANGO_ORIGIN,
    },
  },
});
