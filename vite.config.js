import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon-180x180.png"],
      manifest: {
        name: "KalasääApp",
        short_name: "Kalasää",
        description: "KalasääApp – sää & ottiennuste",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#0b5cff",
        background_color: "#ffffff",
        icons: [
          { src: "/icons/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],

  build: {
    chunkSizeWarningLimit: 1000, // nostaa varoitusrajaa vähän
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          i18n: ["i18next", "react-i18next"],
          firebase: ["firebase/app", "firebase/auth"],
          charts: ["recharts"],
          maps: ["leaflet", "react-leaflet"],
        },
      },
    },
  },
});
