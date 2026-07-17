import { defineConfig } from "vite";

const proxyTarget = process.env.VITE_PROXY_API_TARGET;

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: proxyTarget
      ? {
          "/api": {
            target: proxyTarget,
            changeOrigin: true,
            secure: true
          }
        }
      : undefined
  }
});
