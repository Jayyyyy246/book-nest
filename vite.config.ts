import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

/**
 * Resolves the backend API proxy target for Vite dev server.
 * Supported environment variables:
 * - VITE_API_PROXY_TARGET (e.g. "http://127.0.0.1:5056" or "5056")
 * - API_PROXY_TARGET (e.g. "http://127.0.0.1:5056")
 * Defaults to "http://127.0.0.1:5000" if neither is defined.
 */
function resolveProxyTarget(): string {
  const customTarget = (process.env.VITE_API_PROXY_TARGET || process.env.API_PROXY_TARGET)?.trim();
  if (!customTarget) {
    return 'http://127.0.0.1:5000';
  }
  if (/^\d+$/.test(customTarget)) {
    return `http://127.0.0.1:${customTarget}`;
  }
  try {
    const parsed = new URL(customTarget);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return customTarget.replace(/\/+$/, '');
    }
  } catch {}
  console.warn(`[vite.config] Invalid proxy target "${customTarget}". Falling back to default http://127.0.0.1:5000`);
  return 'http://127.0.0.1:5000';
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: resolveProxyTarget(),
          changeOrigin: true,
          ws: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
