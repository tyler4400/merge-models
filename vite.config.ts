import { defineConfig } from "vite";

const sensorHeaders = {
  "Permissions-Policy": "accelerometer=(self), gyroscope=(self)",
  "Feature-Policy": "accelerometer 'self'; gyroscope 'self'",
};

export default defineConfig({
  // 开发时预打包会将依赖移到 node_modules/.vite/deps，改变 import.meta.url，
  // 导致包内 new URL 找不到 wasm；排除后直接从包原位置加载。
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  server: {
    host: true,
    port: 5175,
    allowedHosts: true,
    headers: sensorHeaders,
  },
  preview: {
    host: true,
    port: 5175,
    allowedHosts: true,
    headers: sensorHeaders,
  },
});
