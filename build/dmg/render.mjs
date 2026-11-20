// The install window's backdrop (electron-builder.yml dmg.background): background.svg drawn to background.png at
// 660x400 and background@2x.png for Retina screens, with its words in Fraunces set as the app sets its titles
// (DESIGN.md: weight 500, SOFT 20, WONK 1). Run again after changing either: node build/dmg/render.mjs
import { createCanvas, GlobalFonts, Image } from '@napi-rs/canvas'
import { readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const fonts = join(dirname(createRequire(import.meta.url).resolve('@fontsource-variable/fraunces/package.json')), 'files')
GlobalFonts.registerFromPath(join(fonts, 'fraunces-latin-full-normal.woff2'), 'Fraunces')
GlobalFonts.registerFromPath(join(fonts, 'fraunces-latin-full-italic.woff2'), 'Fraunces Italic')

const WORDS = [
  { text: 'Drag Haligtree to Applications', y: 74, font: '27px Fraunces', axes: "'wght' 500, 'SOFT' 20, 'WONK' 1, 'opsz' 27", color: '#4a4034' },
  { text: 'Then open it from your Applications folder.', y: 350, font: '14px "Fraunces Italic"', axes: "'wght' 400, 'SOFT' 50, 'WONK' 1, 'opsz' 14", color: '#62584b' }
]

const svg = readFileSync(join(here, 'background.svg'))
for (const [scale, name] of [[1, 'background.png'], [2, 'background@2x.png']]) {
  const image = new Image()
  image.src = svg
  const canvas = createCanvas(660 * scale, 400 * scale)
  const page = canvas.getContext('2d')
  page.drawImage(image, 0, 0, 660 * scale, 400 * scale)
  page.scale(scale, scale)
  page.textAlign = 'center'
  for (const one of WORDS) {
    page.font = one.font
    page.fontVariationSettings = one.axes
    page.fillStyle = one.color
    page.fillText(one.text, 330, one.y)
  }
  writeFileSync(join(here, name), canvas.toBuffer('image/png'))
  console.log(`${name}: ${660 * scale}x${400 * scale}`)
}
