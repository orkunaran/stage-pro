import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Uygulama dosyalarını telefona önbelleğe alır: internet olmayan bir
    // mekânda da uygulama açılır ve son eşitlenen repertuvar salt okunur
    // olarak gösterilir.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // public/ altında kendi manifest dosyanız varsa ona dokunulmaz.
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
