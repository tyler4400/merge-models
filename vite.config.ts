import { defineConfig } from "vite";

const sensorHeaders = {
  "Permissions-Policy": "accelerometer=(self), gyroscope=(self)",
  "Feature-Policy": "accelerometer 'self'; gyroscope 'self'",
};

export default defineConfig({
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
