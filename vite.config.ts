import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: true,
    port: 5175,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 5175,
    allowedHosts: true,
  },
});
