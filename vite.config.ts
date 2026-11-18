/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build`             -> normal multi-file PWA build in dist/
// `vite build --mode single` -> one self-contained HTML file in dist-single/
export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    plugins: [
      react(),
      ...(single
        ? [
            viteSingleFile(),
            // The single-file build has no manifest or worker to point at.
            { name: 'strip-manifest', transformIndexHtml: (html: string) => html.replace(/<link rel="(manifest|apple-touch-icon)"[^>]*>\n?/g, '') },
          ]
        : []),
    ],
    define: { __SINGLE_FILE__: JSON.stringify(single) },
    // jsPDF's optional html()/SVG features pull in large libraries we never use.
    resolve: {
      alias: {
        html2canvas: '/src/lib/empty-module.ts',
        dompurify: '/src/lib/empty-module.ts',
        canvg: '/src/lib/empty-module.ts',
      },
    },
    base: './',
    publicDir: single ? false : 'public',
    build: {
      outDir: single ? 'dist-single' : 'dist',
      chunkSizeWarningLimit: 2000,
    },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      setupFiles: ['tests/setup.ts'],
    },
  };
});
