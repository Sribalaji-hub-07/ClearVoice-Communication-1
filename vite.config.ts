import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Vite config for ClearVoice.
// The AudioWorklet processor lives in /public/worklets so it is served
// as a static, unbundled JS file. Browsers load worklet modules via
// audioContext.audioWorklet.addModule(url), and worklet global scope
// support for bundler-style imports is inconsistent across browsers,
// so we deliberately keep that one file dependency-free and unbundled.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icons/apple-touch-icon.png',
        'icons/icon.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-512-maskable.png',
        'worklets/noise-suppressor-worklet.js',
      ],
      manifest: {
        name: 'ClearVoice — Voice & Chat',
        short_name: 'ClearVoice',
        description: 'Neo-brutalist real-time noise suppression, P2P calling & messaging.',
        theme_color: '#FFE600',
        background_color: '#12151A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
      },
    }),
  ],
  server: {
    port: 5173,
    headers: {
      // Not strictly required for mic access, but useful if you later
      // add SharedArrayBuffer-based processing.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
})
