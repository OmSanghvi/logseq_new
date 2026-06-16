import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    outDir: "../../static/js/kova",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/entry.tsx",
      output: {
        // Single self-contained IIFE — logseq loads it via <script>
        format:   "iife",
        name:     "Kova",
        entryFileNames: "kova.js",
        assetFileNames: "kova.[ext]",
      },
    },
  },
  // Dev: proxy API requests to logseq
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
})
