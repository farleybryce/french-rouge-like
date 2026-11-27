import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
  base: "/french-rouge-like/",
  plugins: [
    VitePWA({
      registerType: "prompt",
      injectRegister: "auto",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Le Donjon — Le Château des Échos",
        short_name: "Le Donjon",
        lang: "fr",
        description: "Une aventure pour apprendre le français.",
        theme_color: "#101d20",
        background_color: "#101d20",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,json}"],
        navigateFallback: "index.html",
      },
    }),
  ],
});
