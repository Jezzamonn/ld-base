import { defineConfig } from 'vite';
import fs from 'fs';

const DEFAULT_LEVEL_PATH = './public/level/map.json';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: './',
  plugins: [
    {
      name: 'serve-default-level',
      configureServer(server) {
        server.middlewares.use('/default-level.json', (_req, res) => {
          try {
            const data = fs.readFileSync(DEFAULT_LEVEL_PATH, 'utf-8');
            res.setHeader('Content-Type', 'application/json');
            res.end(data);
          } catch {
            res.statusCode = 404;
            res.end('Not found');
          }
        });
      },
    },
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        editor: 'editor.html',
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
