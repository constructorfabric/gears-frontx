import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';

/**
 * Stands in for the ingestion backend so the demo has somewhere real to POST. The published
 * package is transport-agnostic: it sends whatever envelope the SDK builds to the configured
 * `url`, and this middleware just echoes it to the terminal.
 */
function collector(): Plugin {
  return {
    name: 'telemetry-collector',
    configureServer(server) {
      const handler: Connect.NextHandleFunction = (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            server.config.logger.info(
              `\n[collector] ${new Date().toISOString()}\n${JSON.stringify(JSON.parse(body), null, 2)}`,
            );
          } catch {
            server.config.logger.warn(`[collector] non-JSON body: ${body}`);
          }
          res.statusCode = 204;
          res.end();
        });
      };

      server.middlewares.use('/api/events', handler);
    },
  };
}

export default defineConfig({
  plugins: [collector()],
  optimizeDeps: {
    // The SDK is a workspace symlink. Vite would pre-bundle it and keep serving that cached copy
    // after a rebuild replaces dist/, so the page silently runs stale SDK code. Excluding it means
    // the demo always executes the current build.
    exclude: ['@gears-frontx/telemetry'],
  },
  server: {
    // Pinned so the `url` in src/main.ts stays correct. 5273 rather than vite's default, so the
    // example and the monorepo's own dev server can run at the same time.
    port: 5273,
    strictPort: true,
  },
});
