// The notes map: the whole map, a dot pointed at, a dot clicked, and the
// empty page, in a light and a dark theme.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-map/main/index.js SHOTS=<dir> node qa/map.mjs
//   EMPTY=1 QA_DATA=$(mktemp -d) QA_ENTRY=out-map/main/index.js SHOTS=<dir> node qa/map.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
const empty = !!process.env.EMPTY
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: 1100, height: 760, seeded: !empty })
const { h, v, go } = c
const fail = []
try {
  // A new, empty book: the welcome marked as seen, so the page itself shows.
  if (empty) { await v('onboarding:set', { welcomed: new Date().toISOString(), pageHints: false }); await h.reload(); await h.waitForTimeout(1500) }
  const map = await v('notes:graph:all')
  console.log(`map: ${map.nodes.length} linked notes, ${map.edges.length} links, ${map.alone} with none`)
  if (empty && map.nodes.length) fail.push('expected no links')

  // A dot found by its colour on the canvas, then pointed at; of a few, the one with the most links.
  const pointAtHub = async () => {
    const spots = await h.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return []
      const { width, height } = canvas
      const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
      const dpr = devicePixelRatio, rect = canvas.getBoundingClientRect(), found = []
      for (let y = 4; y < height - 4; y += 6)
        for (let x = 4; x < width - 4; x += 6) {
          const at = (y * width + x) * 4
          const [r, g, b, a] = [data[at], data[at + 1], data[at + 2], data[at + 3]]
          if (a > 250) found.push([rect.left + x / dpr, rect.top + y / dpr])
        }
      return found.filter((_, i) => i % Math.max(1, Math.floor(found.length / 40)) === 0)
    })
    let best = null
    for (const [x, y] of spots) {
      await h.mouse.move(x, y)
      await h.waitForTimeout(60)
      const said = await h.evaluate(() => document.querySelector('[data-map-tip]')?.textContent ?? '')
      const links = Number(said.match(/(\d+) links?/)?.[1] ?? 0)
      if (links && (!best || links > best.links)) best = { x, y, links, said }
    }
    if (best) { await h.mouse.move(best.x, best.y); await h.waitForTimeout(400) }
    return best
  }

  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await c.size(1100, 760)
    await go('map')
    await h.waitForTimeout(empty ? 6000 : 3500)
    await h.mouse.move(5, 5)
    await h.screenshot({ path: `${dir}/${empty ? 'empty' : 'map'}-${theme}.png` })
    if (empty) continue
    const hub = await pointAtHub()
    console.log(theme, 'hover:', hub?.said ?? 'nothing found')
    if (!hub) fail.push(`no hover in ${theme}`)
    await h.screenshot({ path: `${dir}/hover-${theme}.png` })
  }

  if (!empty) {
    // Zoom in at the middle, then fit again.
    const box = await h.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] })
    await h.mouse.move(box[0], box[1])
    await h.keyboard.down('Meta'); await h.mouse.wheel(0, -200); await h.keyboard.up('Meta')
    await h.waitForTimeout(300)
    await h.screenshot({ path: `${dir}/zoomed-dark.png` })
    // Clicking a dot opens its note: the page is no longer the map.
    const hub = await pointAtHub()
    if (hub) {
      await h.mouse.click(hub.x, hub.y)
      await h.waitForTimeout(1200)
      const still = await h.evaluate(() => !!document.querySelector('canvas'))
      console.log('click opened a note:', !still, hub.said, await h.evaluate(() => document.querySelector('h1')?.textContent))
      if (still) fail.push('click did not open the note')
      await h.screenshot({ path: `${dir}/opened-dark.png` })
    }
    // With reduced motion the map is drawn settled at once.
    await h.emulateMedia({ reducedMotion: 'reduce' })
    await go('map')
    await h.waitForTimeout(200)
    await h.screenshot({ path: `${dir}/reduced-dark.png` })
  }
  if (!empty) {
    // 600 notes and 900 links, handed to the page in place of the sandbox's: frames stay quick, and it goes still once settled.
    await h.emulateMedia({ reducedMotion: 'no-preference' })
    await go('home')
    // The main process answers the map's channel with the made-up notes instead.
    await c.electron.evaluate(({ ipcMain }) => {
      const kinds = ['note', 'quote', 'word', 'link', 'decision', 'experiment', 'todo']
      const nodes = Array.from({ length: 600 }, (_, i) => ({ type: 'capture', id: `n${i}`, title: `Note number ${i}`, kind: kinds[i % 7], links: 0 }))
      const edges = []
      for (let i = 1; i < 600; i++) edges.push([`n${Math.floor(Math.random() * i)}`, `n${i}`])
      for (let i = 0; i < 300; i++) edges.push([`n${Math.floor(Math.random() * 600)}`, `n${Math.floor(Math.random() * 600)}`])
      const ok = edges.filter(([a, b]) => a !== b)
      for (const [a, b] of ok) (nodes[+a.slice(1)].links++, nodes[+b.slice(1)].links++)
      ipcMain.removeHandler('vigil:notes:graph:all')
      ipcMain.handle('vigil:notes:graph:all', () => ({ nodes, edges: ok, alone: 0 }))
    })
    await go('map')
    const frames = await h.evaluate(() => new Promise((done) => {
      const times = []; let last = performance.now()
      const tick = (now) => { times.push(now - last); last = now; if (times.length < 120) requestAnimationFrame(tick); else done(times) }
      requestAnimationFrame(tick)
    }))
    const sorted = [...frames].sort((a, b) => a - b)
    console.log(`600 dots while settling: median frame ${sorted[60].toFixed(1)}ms, slowest ${sorted.at(-1).toFixed(1)}ms`)
    await h.waitForTimeout(6000)
    await h.screenshot({ path: `${dir}/many-dark.png` })
    const busy = await h.evaluate(() => new Promise((done) => {
      const ctx = document.querySelector('canvas').getContext('2d'); let draws = 0
      const clear = ctx.clearRect.bind(ctx); ctx.clearRect = (...a) => (draws++, clear(...a))
      setTimeout(() => done(draws), 1000)
    }))
    console.log('redraws in a second once settled:', busy)
    if (busy) fail.push('still drawing once settled')
  }
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
} finally {
  await c.close()
}
console.log(fail.length ? `FAIL: ${fail.join('; ')}` : 'PASS')
process.exit(fail.length ? 1 : 0)
