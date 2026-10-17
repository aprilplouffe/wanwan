import { cpSync, copyFileSync, existsSync } from 'node:fs'

const out = 'dist'
for (const dir of ['js', 'css', 'img', 'audio']) {
  cpSync(dir, `${out}/${dir}`, { recursive: true })
}
for (const file of ['service.js', 'manifest.json']) {
  copyFileSync(file, `${out}/${file}`)
}
if (!existsSync(`${out}/index.html`)) {
  throw new Error('dist/index.html missing — run vite build first')
}
console.log('static assets copied to dist/')
