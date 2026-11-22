import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        about: "about.html",
        drop: "drop.html",
        backup: "backup.html"
      }
    }
  }
});
