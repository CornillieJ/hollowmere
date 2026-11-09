import { defineConfig, loadEnv } from 'vite';

import restart from 'vite-plugin-restart';

/**
 * Dev server on plain HTTP: a three.js game does not need TLS. For WebXR or any
 * other API that requires a secure context, add `vite-plugin-mkcert` and set
 * `server.https` to `{}`.
 *
 * The port comes from `VITE_PORT` in `.env`, so several games can be served at
 * once. Each game repository owns its own `.env`.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = Number(env.VITE_PORT ?? 5180);

  return {
    root: 'src/', // Sources files (typically where index.html is)
    publicDir: '../static/', // Path from "root" to static assets
    base: './',
    server: {
      host: true,
      port,
      open: !('SANDBOX_URL' in process.env || 'CODESANDBOX_HOST' in process.env),
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      sourcemap: true,
      // Rapier's wasm is inlined as base64, which is 4 MB before gzip on its own.
      chunkSizeWarningLimit: 5000,
      rollupOptions: {
        output: {
          manualChunks: {
            three: ['three', 'three-stdlib', 'troika-three-text'],
            rapier: ['@dimforge/rapier3d-compat'],
            gsap: ['gsap'],
          },
        },
      },
    },
    optimizeDeps: {
      // Rapier ships a base64-embedded wasm build; pre-bundling is not needed.
      exclude: ['@dimforge/rapier3d-compat'],
    },
    plugins: [restart({ restart: ['../static/**'] })],
  };
});
