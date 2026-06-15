import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devHost = process.env.VITE_DEV_HOST || env.VITE_DEV_HOST || '127.0.0.1'
  const devPort = Number(process.env.VITE_DEV_PORT || env.VITE_DEV_PORT || 5173)
  const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3001'
  const privateAppHost = process.env.VITE_PRIVATE_APP_HOST || env.VITE_PRIVATE_APP_HOST || ''
  const privateAppHostWithoutPort = privateAppHost.split(':')[0]
  const allowedHosts = Array.from(new Set([devHost, privateAppHost, privateAppHostWithoutPort, 'localhost', '127.0.0.1'].filter(Boolean)))

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: devHost,
      port: devPort,
      allowedHosts,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
