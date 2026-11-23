import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const packageVersion =
  (
    JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
      version?: string;
    }
  ).version ?? '0.0.0';

/*
 * The API (customer-assistant-core) installs no CORS middleware: local it runs
 * on :8000, deployed it lives at https://dev-customer-assistant-api.si24.ir.
 * The dev server therefore proxies the API paths so the page and the API share
 * an origin, whichever target VITE_PROXY_TARGET names. In production, serve the
 * built `dist/` behind the same reverse proxy that fronts the API, or set
 * VITE_API_BASE_URL to an origin that allows this one.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000';
  // Escape hatch for targets whose certificate is signed by an internal CA.
  const secure = env.VITE_PROXY_INSECURE !== 'true';

  /*
   * A deployment's gateway proves it is the edge by sending X-Internal-Auth.
   * The browser must never hold that secret, so the dev server plays the
   * gateway's part and adds the header itself: it is read from a non-VITE
   * variable (this file runs in Node) and therefore never reaches the bundle.
   * When the target sits behind a real gateway, or the backend runs in
   * header-only mode, the value is empty and the header is simply not sent.
   */
  const gatewaySecret = env.SAMAN_IDENTITY_SHARED_SECRET || '';
  const gatewayHeaders = gatewaySecret
    ? { 'X-Internal-Auth': gatewaySecret }
    : undefined;

  /*
   * Every log record carries the release. CI passes APP_RELEASE (the deploy
   * tag) as a build arg; local builds fall back to the package version.
   * Hidden source maps stay opt-in because the map files expose source and
   * must be uploaded to the log provider privately, not shipped with dist.
   */
  const release = env.VITE_RELEASE || env.APP_RELEASE || packageVersion;

  return {
    plugins: [react()],
    define: {
      __APP_RELEASE__: JSON.stringify(release),
    },
    build: {
      sourcemap: env.VITE_SOURCEMAP === 'true' ? 'hidden' : false,
    },
    server: {
      port: 5173,
      proxy: {
        /*
         * The browser calls /api/... on both dev and the deployed edge; the
         * prefix is stripped here so the upstream still sees /chat, /ingestion
         * and /health. Keep it in sync with VITE_API_PREFIX (client.ts) and
         * nginx.conf.template.
         */
        '/api': {
          target,
          changeOrigin: true,
          secure,
          headers: gatewayHeaders,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
        // Kept for tools that hit the bare API paths directly.
        '/chat': { target, changeOrigin: true, secure, headers: gatewayHeaders },
        '/ingestion': { target, changeOrigin: true, secure, headers: gatewayHeaders },
        '/health': { target, changeOrigin: true, secure },
        '/docs': { target, changeOrigin: true, secure },
        '/openapi.json': { target, changeOrigin: true, secure },
      },
    },
    preview: {
      port: 4173,
    },
  };
});
