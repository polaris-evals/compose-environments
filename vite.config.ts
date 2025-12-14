import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

export default defineConfig(({ command }) => ({
  plugins: [preact()],
  // Use base path only for production (GitHub Pages)
  base: command === 'build' ? '/compose-environments/' : '/',
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
}))
