import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/expedition-33-game-companion/',
  plugins: [
    vue(),
  ],
  server: {
    port: 5174
  },
  preview: {
    port: 4174
  },
})