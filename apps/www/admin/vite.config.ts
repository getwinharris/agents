import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  build: {
    outDir: '../dist/admin',
    emptyOutDir: true,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    // The workspace has multiple React copies; force a single instance so
    // hooks from `@shadcn/react` (and `@bapX/react`) share the app's React.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
