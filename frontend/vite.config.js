import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'catalog-pwa',
      apply: 'build',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const assets = Object.keys(bundle).filter((name) => /\.(js|css)$/.test(name)).map((name) => `/${name}`)
        const source = readFileSync(new URL('./pwa/catalog-sw.js', import.meta.url), 'utf8')
        const version = createHash('sha256').update(source + assets.join('|')).digest('hex').slice(0, 12)
        const precache = ['/catalogo', '/shopping-rural.png', '/pwa/icon-192.png', '/pwa/icon-512.png', ...assets]
        this.emitFile({
          type: 'asset', fileName: 'catalog-sw.js',
          source: source.replace('__CATALOG_CACHE__', `shopping-rural-catalog-${version}`)
            .replace('/*__PRECACHE__*/ []', JSON.stringify(precache)),
        })
      },
    },
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  }
})
