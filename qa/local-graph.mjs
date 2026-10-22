// A note's Links graph in Details, and the Map fading in.
// A note with 220 links (15 out, 205 in) is seeded; its panel graph is checked
// for names that overlap, a hover, ⌘-scroll zoom and a click that opens; then
// "Show on the Map", the Map fading in, and the same with Motion off.
//   npx electron-vite build --outDir out-graph
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-graph/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/local-graph.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: 1280, height: 860 })
const { h, v, send } = c
const fail = []
const check = (ok, what) => (ok || fail.push(what), console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`))

// Every name a canvas paints, as a box on the screen, kept per frame.
const watchNames = () => h.evaluate(() => {
  const proto = CanvasRenderingContext2D.prototype
  if (proto.__watched) return
  proto.__watched = true
  const clear = proto.clearRect, fill = proto.fillText
  proto.clearRect = function (...a) { this.canvas.__names = []; return clear.apply(this, a) }
  proto.fillText = function (text, x, y) {
    const m = this.getTransform(), w = this.measureText(text).width, dpr = devicePixelRatio
    const x0 = this.textAlign === 'right' ? x - w : x
    const size = parseFloat(this.font.match(/([\d.]+)px/)[1])
    const at = (px, py) => [(m.a * px + m.e) / dpr, (m.d * py + m.f) / dpr]
    const [l, t] = at(x0, y - size / 2), [r, b] = at(x0 + w, y + size / 2)
    if (this.globalAlpha > 0.05) (this.canvas.__names ??= []).push({ text, box: [l, t, r, b] })
    return fill.call(this, text, x, y)
  }
})
const names = (selector) => h.evaluate((s) => document.querySelector(s)?.__names ?? [], selector)
const overlapping = (list) => {
  const bad = []
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i].box, list[j].box]
      if (!(a[2] <= b[0] || a[0] >= b[2] || a[3] <= b[1] || a[1] >= b[3])) bad.push(`${list[i].text} / ${list[j].text}`)
    }
  return bad
}
// Painted pixels on a canvas, as a share of its area: how much of the map is showing.
const painted = (selector) => h.evaluate((s) => {
  const canvas = document.querySelector(s)
  if (!canvas) return 0
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
  let sum = 0
  for (let i = 3; i < data.length; i += 16) sum += data[i]
  return sum / (data.length / 16) / 255
}, selector)
// Dots on a canvas, by their colour, as points on the screen.
const spots = (selector) => h.evaluate((s) => {
  const canvas = document.querySelector(s)
  const { width, height } = canvas
  const data = canvas.getContext('2d').getImageData(0, 0, width, height).data
  const dpr = devicePixelRatio, rect = canvas.getBoundingClientRect(), found = []
  for (let y = 4; y < height - 4; y += 4)
    for (let x = 4; x < width - 4; x += 4) {
      const at = (y * width + x) * 4
      if (data[at + 3] > 250) found.push([rect.left + x / dpr, rect.top + y / dpr])
    }
  return found
}, selector)
const tip = () => h.evaluate(() => document.querySelector('[data-map-tip]')?.textContent ?? '')

try {
  // --- the note and its 220 neighbours
  const make = (title, kind, links = []) => h.evaluate(([title, kind, links]) => window.api.captures.create({ kind, title, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${title} ` }, ...links.map((id) => ({ type: 'noteLink', attrs: { id, label: 'x' } }))] }] } }), [title, kind, links])
  const kinds = ['note', 'quote', 'word', 'link', 'decision', 'experiment', 'todo']
  const services = ['AppSync', 'Artifact', 'Backup', 'Batch', 'Braket', 'Budgets', 'Chime', 'Cloud9', 'CloudFront', 'CloudTrail', 'CodeBuild', 'Cognito', 'Comprehend', 'Config', 'DataSync']
  const outs = []
  for (let i = 0; i < 15; i++) outs.push(await make(`AWS ${services[i]}`, kinds[i % 7]))
  const hub = await make('AWS services', 'note', outs)
  const ins = []
  for (let i = 0; i < 205; i++) ins.push(await make(`AWS note ${i}`, kinds[i % 7], i % 4 === 0 && ins.length ? [hub, ins[ins.length - 1]] : [hub]))
  const own = await v('notes:graph', hub)
  console.log(`hub: ${own.out.length} out, ${own.in.length} in`)

  await watchNames()
  await h.evaluate(() => localStorage.setItem('noteDetails', 'open'))
  const G = '[data-local-graph] canvas'
  const openHub = async () => {
    // Details start put away each time the window loads, so they are asked for again.
    await h.evaluate(() => (localStorage.setItem('noteDetails', 'open'), window.dispatchEvent(new Event('mf:details'))))
    await send('capture', hub)
    await h.waitForSelector(G, { timeout: 15000 })
    await h.waitForTimeout(2500)
    await h.evaluate(() => document.querySelector('[data-local-graph]').scrollIntoView({ block: 'center' }))
    await h.waitForTimeout(400)
  }

  for (const theme of ['light', 'dark']) {
    await c.theme(theme)
    await watchNames()
    await openHub()
    const said = await names(G)
    console.log(theme, 'names drawn:', said.map((one) => one.text).join(', '))
    check(said.length >= 2, `${theme}: the note and some neighbours are named`)
    check(!overlapping(said).length, `${theme}: no names overlap (${overlapping(said).slice(0, 3).join('; ')})`)
    const box = await h.evaluate(() => { const r = document.querySelector('[data-local-graph]').closest('section').getBoundingClientRect(); return { x: r.left - 4, y: r.top - 4, width: r.width + 8, height: r.height + 8 } })
    check(Math.abs(box.height - 8 - 300) < 40, `${theme}: panel graph is about 280px tall (${Math.round(box.height - 8)}px with its heading)`)
    await h.mouse.move(5, 5)
    await h.waitForTimeout(300)
    await h.screenshot({ path: `${dir}/panel-${theme}.png`, clip: box })
    // Pointed at: a busy neighbour names itself and its links light up.
    let best = null
    const points = await spots(G)
    for (const [x, y] of points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 30)) === 0)) {
      await h.mouse.move(x, y)
      await h.waitForTimeout(50)
      const words = await tip()
      if (words && !words.includes('This note')) { best = { x, y, words }; break }
    }
    check(!!best, `${theme}: hover shows a name (${best?.words})`)
    if (best) {
      await h.mouse.move(best.x, best.y)
      await h.waitForTimeout(400)
      check(!overlapping(await names(G)).length, `${theme}: no names overlap while pointing`)
      await h.screenshot({ path: `${dir}/panel-hover-${theme}.png`, clip: box })
    }
  }

  // ⌘-scroll zooms in; a plain scroll is left to the panel.
  const zoomOf = () => h.evaluate((s) => document.querySelector(s).getContext('2d').getTransform().a / devicePixelRatio, G)
  const middle = await h.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2] }, G)
  await h.mouse.move(middle[0] + 40, middle[1] + 40)
  const before = await zoomOf()
  await h.keyboard.down('Meta'); await h.mouse.wheel(0, -150); await h.keyboard.up('Meta')
  await h.waitForTimeout(300)
  const after = await zoomOf()
  check(after > before * 1.3, `⌘-scroll zooms (${before.toFixed(2)} → ${after.toFixed(2)})`)
  check(!overlapping(await names(G)).length, 'no names overlap zoomed in')
  await h.screenshot({ path: `${dir}/panel-zoomed-dark.png` })

  // A click on a neighbour opens it.
  await openHub()
  const points = await spots(G)
  let opened = false
  for (const [x, y] of points.filter((_, i) => i % Math.max(1, Math.floor(points.length / 30)) === 0)) {
    await h.mouse.move(x, y)
    await h.waitForTimeout(50)
    const words = await tip()
    if (!words || words.includes('This note')) continue
    const title = await h.evaluate(() => document.querySelector('[data-map-tip] span')?.textContent)
    const was = await h.evaluate(() => document.querySelector('[data-local-graph]')?.innerText)
    await h.mouse.click(x, y)
    await h.waitForTimeout(2500)
    const now = await h.evaluate(() => document.querySelector('[data-local-graph]')?.innerText)
    const shows = await h.evaluate((t) => [...document.querySelectorAll('h1, textarea, input, [contenteditable]')].some((one) => (one.value ?? one.textContent ?? '').includes(t)), title)
    console.log('clicked', JSON.stringify(title), '→ panel', JSON.stringify(was), '→', JSON.stringify(now), 'title shown:', shows)
    opened = was !== now && now.startsWith(title)
    break
  }
  check(opened, 'a click on a dot opens its note')

  // "Show on the Map": the Map opens with the note lit and its neighbours named.
  await openHub()
  await h.click('text=See on Map')
  await h.waitForTimeout(1500)
  const onMap = await names('canvas:not([data-local-graph] canvas)')
  check(await h.evaluate(() => !document.querySelector('[data-local-graph]') && !!document.querySelector('canvas')), 'Show on the Map opens the Map')
  check(onMap.length > 3, `the Map opens lit on the note (${onMap.length} names)`)
  await h.screenshot({ path: `${dir}/map-focused-dark.png` })

  // --- the Map fading in: how much is painted, frame by frame
  const fadeIn = async (label) => {
    await c.go('home')
    await send('view', 'map')
    const samples = await h.evaluate(() => new Promise((done) => {
      const out = [], start = performance.now()
      const tick = () => {
        const canvas = document.querySelector('canvas')
        if (canvas && canvas.width) {
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
          let sum = 0
          for (let i = 3; i < data.length; i += 64) sum += data[i]
          out.push([Math.round(performance.now() - start), sum])
        }
        if (performance.now() - start < 1600) requestAnimationFrame(tick)
        else done(out)
      }
      requestAnimationFrame(tick)
    }))
    const first = samples.find(([, sum]) => sum > 0)
    const end = samples.at(-1)[1]
    const settled = samples.find(([, sum]) => sum >= end * 0.9)
    console.log(label, 'first paint', first?.[0], 'ms at', Math.round(100 * (first?.[1] ?? 0) / end), '% of the end; 90% by', settled ? settled[0] - first[0] : '?', 'ms after')
    return { start: (first?.[1] ?? 0) / end, rise: settled ? settled[0] - first[0] : 9999 }
  }
  await h.emulateMedia({ reducedMotion: 'no-preference' })
  await v('settings:set', { motion: true })
  await h.waitForTimeout(300)
  const on = await fadeIn('Motion on:')
  check(on.start < 0.5 && on.rise >= 250 && on.rise <= 900, `Motion on: the map fades in (starts at ${Math.round(on.start * 100)}%, 90% after ${on.rise}ms)`)
  // Frames of it, by a fresh map each time.
  for (const at of [0, 120, 260, 420, 800]) {
    await c.go('home')
    await send('view', 'map')
    await h.waitForSelector('canvas')
    await h.waitForTimeout(at)
    await h.screenshot({ path: `${dir}/fade-${String(at).padStart(3, '0')}ms.png` })
  }
  await v('settings:set', { motion: false })
  await h.waitForTimeout(300)
  check(await h.evaluate(() => document.documentElement.dataset.motion) === 'off', 'Motion is off')
  const off = await fadeIn('Motion off:')
  check(off.start > 0.9, `Motion off: everything at once (first frame ${Math.round(off.start * 100)}% of the end)`)
  const busy = await h.evaluate(() => new Promise((done) => {
    const canvas = document.querySelector('canvas'); let draws = 0
    const ctx = canvas.getContext('2d'), clear = ctx.clearRect.bind(ctx); ctx.clearRect = (...a) => (draws++, clear(...a))
    setTimeout(() => done(draws), 800)
  }))
  check(busy === 0, `Motion off: settled, nothing moving (${busy} redraws)`)
  await h.screenshot({ path: `${dir}/motion-off-dark.png` })
  // The panel graph with Motion off: drawn whole at once.
  await openHub()
  check(!overlapping(await names(G)).length, 'Motion off: panel names do not overlap')
  await v('settings:set', { motion: true })
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  check(!c.errors.length, 'no errors on the page')
} finally {
  await c.close()
}
console.log(fail.length ? `FAIL: ${fail.join('; ')}` : 'PASS')
process.exit(fail.length ? 1 : 0)
