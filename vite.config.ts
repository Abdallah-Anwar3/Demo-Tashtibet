// File: vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { BRAND } from "./src/config/brand";

/** يمرّر بيانات الهوية إلى index.html من src/config/brand.ts */
const brandHtml = () => ({
  name: "brand-html",
  transformIndexHtml: (html: string) =>
    html
      .replace(/%BRAND_NAME%/g, BRAND.name)
      .replace(/%BRAND_THEME%/g, BRAND.themeColor),
});

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  plugins: [
    react(),
    brandHtml(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.png",
        "logo.png",
        "logo-white.png",
        "mark.png",
        "mark-white.png",
        "icons/*.png",
      ],
      manifest: {
        name: `${BRAND.name} — إدارة المواقع`,
        short_name: BRAND.shortName,
        description: BRAND.appDescription,
        lang: "ar",
        dir: "rtl",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: BRAND.themeColor,
        theme_color: BRAND.themeColor,
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        importScripts: ["push-sw.js"], // Web Push handlers (public/push-sw.js)
        runtimeCaching: [
          {
            // Google Fonts (Cairo)
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 31536000 },
            },
          },
          {
            // Reads: show cached data instantly, refresh in background
            urlPattern: ({ url }) => url.pathname.startsWith("/rest/v1/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 100, maxAgeSeconds: 86400 },
            },
          },
          {
            // Uploaded photos / receipts
            urlPattern: ({ url }) => url.pathname.startsWith("/storage/v1/"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "storage",
              expiration: { maxEntries: 60, maxAgeSeconds: 604800 },
            },
          },
        ],
      },
    }),
  ],
});
