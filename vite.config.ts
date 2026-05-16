import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/pui-app/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Personal App',
        short_name: 'MyLife',
        description: 'แอพข้อมูลส่วนตัว',
        theme_color: '#4f46e5',
        background_color: '#f5f6fa',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/pui-app/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/generativelanguage\.googleapis\.com\/.*/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
