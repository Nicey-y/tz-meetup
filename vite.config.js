import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// the folder this config file lives in
var projectFolder = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  base: '/tz-meetup/',

  build: {
    rollupOptions: {
      input: {
        main: resolve(projectFolder, 'index.html'),
        event: resolve(projectFolder, 'event.html')
      }
    }
  }
})