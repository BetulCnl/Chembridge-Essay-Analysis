import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

/** Where the pipeline wrote the published data (`pnpm pipeline publish`). */
const dataDir = resolve(
  process.env.CHEMBRIDGE_PUBLIC_DATA ?? join(here, '..', '..', '.data', 'public'),
);

const TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/rss+xml; charset=utf-8',
};

/** Serves the pipeline output under /data in dev and copies it into dist/data on build. */
function chembridgeData(): Plugin {
  let outDir = 'dist';
  return {
    name: 'chembridge-data',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(
          /^(\.\.[/\\])+/,
          '',
        );
        const file = join(dataDir, rel);
        if (!file.startsWith(dataDir) || !existsSync(file) || !statSync(file).isFile())
          return next();
        res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (existsSync(dataDir)) {
        cpSync(dataDir, join(outDir, 'data'), { recursive: true });
        this.info?.(`copied data from ${dataDir}`);
      } else {
        console.warn(
          `[chembridge-data] ${dataDir} not found; the site will show its "no data yet" state`,
        );
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), chembridgeData()],
  build: {
    target: 'es2022',
    sourcemap: false,
    // The only large chunk is @mlc-ai/web-llm, loaded on demand when a user enables Layer B.
    chunkSizeWarningLimit: 6500,
  },
});
