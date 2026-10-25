// The Map's dots with quiet depth (a lit top left, a darker rim, a faint shadow
// below) and calmer icons, in Paper, GitHub Dark and Brutal, close up and far
// off; frames saved straight from the canvas to compare by eye (TAG=before on
// an older build). Prints a rough lit-side reading; checks only for errors.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-m/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> TAG=after node qa/map-depth.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
const tag = process.env.TAG ?? 'shot'
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: 1280, height: 860 })
const { h, go } = c
let pass = 0, fail = 0
const check = (ok, what) => (ok ? pass++ : fail++, console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`))
// The canvas as a PNG, and how much lighter the top left of the biggest dot is than its bottom right.
const grab = async (name) => {
  const { url, lift } = await h.evaluate(() => {
    const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    const g = canvas.getContext('2d'), { width, height } = canvas
    const data = g.getImageData(0, 0, width, height).data
    const bg = [data[0], data[1], data[2], data[3]]
    // The longest run of non-page pixels along a row is taken as a dot's width there; the widest wins.
    let best = { len: 0, x: 0, y: 0 }
    for (let y = 0; y < height; y += 2) {
      let run = 0
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const off = data[i + 3] > 200 && Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) + Math.abs(data[i + 3] - bg[3]) > 40
        run = off ? run + 1 : 0
        if (run > best.len) best = { len: run, x: x - run / 2, y }
      }
    }
    const r = best.len / 2
    const at = (dx, dy) => { const i = (Math.round(best.y + dy) * width + Math.round(best.x + dx)) * 4; return (data[i] + data[i + 1] + data[i + 2]) / 3 }
    return { url: canvas.toDataURL('image/png'), lift: r > 6 ? at(-r * 0.4, -r * 0.4) - at(r * 0.45, r * 0.45) : null }
  })
  writeFileSync(`${dir}/${tag}-${name}.png`, Buffer.from(url.split(',')[1], 'base64'))
  return lift
}
try {
  for (const [theme, style] of [['paper', 'soft'], ['github', 'soft'], ['paper', 'brutal']]) {
    await h.evaluate((s) => (s === 'brutal' ? localStorage.setItem('style', 'brutal') : localStorage.removeItem('style')), style)
    await c.theme(theme)
    await go('map')
    await h.waitForTimeout(3500)
    await h.mouse.move(5, 5)
    const name = `${theme}${style === 'brutal' ? '-brutal' : ''}`
    const far = await grab(name)
    // Close up, where the icons show.
    const box = await h.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await h.mouse.move(box[0], box[1])
    await h.keyboard.down('Meta'); for (let i = 0; i < 8; i++) { await h.mouse.wheel(0, -80); await h.waitForTimeout(60) } await h.keyboard.up('Meta')
    await h.mouse.move(5, 5)
    await h.waitForTimeout(1500)
    const near = await grab(`${name}-near`)
    console.log(`${name}: top left lighter than bottom right by ${far?.toFixed(1)} far off, ${near?.toFixed(1)} close up`)
  }
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  check(!c.errors.length, 'no errors')
} finally {
  await c.close()
}
console.log(`${pass} passed, ${fail} failed`)
