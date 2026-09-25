import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// `base: './'` keeps the build portable: it runs from a domain root or a
// sub-path such as GitHub Pages without extra configuration.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 3000,
    target: 'es2022',
  },
})
