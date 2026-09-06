import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the API runs on :4000. In the cluster there is no proxy here
    // at all — the Ingress routes /api to the backend Service, so the browser sees
    // one origin either way and cookies just work.
    proxy: { "/api": "http://localhost:4000" },
  },
  build: { outDir: "dist", sourcemap: false },
});
