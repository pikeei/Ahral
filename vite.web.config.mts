import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/*
 * The website build: the same React screens as the desktop app, with a browser backend
 * (src/web). Output in dist-web/, a static site that any host can serve (GitHub Pages).
 *
 *   npm run web:dev       development server with hot reload
 *   npm run web:build     build into dist-web/
 *   npm run web:preview   serve the built site locally
 */

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

/** Static files the app loads at run time, served in development and copied into the build. */
const STATIC_FILES: { from: string; to: string }[] = [
  { from: 'node_modules/word-list/words.txt', to: 'dictionary.txt' },
  { from: 'build/icon.png', to: 'icon.png' },
  ...readdirSync('node_modules/pdfjs-dist/standard_fonts').map((name) => ({
    from: `node_modules/pdfjs-dist/standard_fonts/${name}`,
    to: `standard_fonts/${name}`
  }))
]

function staticFiles(): Plugin {
  const byPath = new Map(STATIC_FILES.map((f) => [`/${f.to}`, resolve(f.from)]))
  return {
    name: 'ahral-static-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = byPath.get(decodeURIComponent((req.url ?? '').split('?')[0] ?? ''))
        if (!file || !existsSync(file)) return next()
        res.setHeader('Content-Length', statSync(file).size)
        createReadStream(file).pipe(res)
      })
    },
    generateBundle() {
      for (const f of STATIC_FILES) this.emitFile({ type: 'asset', fileName: f.to, source: readFileSync(f.from) })
    }
  }
}

/**
 * Content Security Policy for the built site: only the site's own code, no network calls
 * elsewhere. 'wasm-unsafe-eval' lets SQLite's WebAssembly run. Development leaves it out,
 * since the dev server injects inline scripts for hot reload.
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self'",
    "connect-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:"
  ].join('; ')
  return {
    name: 'ahral-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }
    ]
  }
}

export default defineConfig({
  root: 'src/web',
  // Relative paths, so the site works at any address (e.g. https://user.github.io/Ahral/).
  base: './',
  publicDir: false,
  plugins: [react(), tailwindcss(), staticFiles(), contentSecurityPolicy()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  worker: { format: 'es' },
  // SQLite's package loads its .wasm file relative to itself; pre-bundling would break that.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  build: {
    outDir: join(import.meta.dirname, 'dist-web'),
    emptyOutDir: true,
    target: 'es2023'
  },
  preview: { port: 4173, strictPort: true },
  server: { port: 5173, strictPort: true }
})
