import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 部署基路径。
 *  - 独立运行（npm run dev）：'/'
 *  - 被 ar-platform 创作台以 iframe 挂载时：必须是宿主 vite proxy 的前缀（默认 '/xr-studio-app/'），
 *    否则 index.html 里生成的 /src/main.tsx、/@vite/client 等路径会落到宿主上而 404。
 * 由 scripts/dev-embedded.mjs 注入，也可手动 XR_BASE=... npx vite。
 */
const base = process.env.XR_BASE || '/'
/** 默认 5174：ar-platform 前端常用 5173/5180，避开端口冲突 */
const devPort = Number(process.env.XR_PORT || 5174)

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: devPort,
    // 端口被占时直接失败，而不是悄悄漂到 5175 —— 宿主代理写死的是 5174，
    // 静默漂移会表现为「创作台一直连不上」，排查成本远高于报错
    strictPort: true,
    host: true,
    // 允许被宿主页面 iframe 内联与跨源读取（开发期）
    cors: true,
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        // Rolldown 只接受函数形式的 manualChunks
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/three/')) return 'three'
          if (id.includes('@react-three')) return 'r3f'
          if (id.includes('postprocessing')) return 'postfx'
          return undefined
        },
      },
    },
  },
})
