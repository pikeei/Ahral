import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// electron-vite builds three bundles with conventional entry points:
//   main     → src/main/index.ts       (Node/Electron process: DB, file system)
//   preload  → src/preload/index.ts    (the only bridge between main and UI)
//   renderer → src/renderer/index.html (React UI, no Node access)
export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), tailwindcss()]
  }
})
