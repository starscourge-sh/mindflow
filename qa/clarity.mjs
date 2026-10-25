// Clarity checks: the Map on a big vault, the Stats preview's colours, inner
// scroll boxes taking the wheel, and Settings' visual choices (Dimness preview,
// Covers, Scenery folders). Paper and a dark theme shot for each.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-clarity/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> TAG=after ONLY=map,stats,scroll,settings,covers PICS=<folder of pictures> node qa/clarity.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
const tag = process.env.TAG ?? 'shot'
const only = new Set((process.env.ONLY ?? 'map,stats,scroll,settings,covers').split(','))
mkdirSync(dir, { recursive: true })
let passed = 0, failed = 0
const check = (ok, what) => (ok ? passed++ : failed++, console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`))

const c = await sandbox({ width: 1280, height: 860 })
const { h, go } = c

/** A made-up vault of about 1,000 linked notes: a few topics, each a hub with spokes, joined by a few cross links. */
const bigMap = () => c.electron.evaluate(({ ipcMain }) => {
  let seed = 11
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const topics = [['Cloud Engineer', 'aws', 'purple', 220], ['Vocabulary Reference', 'per', 'pink', 260], ['Math', 'math', 'yellow', 90], ['YouTube', 'youtube', 'orange', 140], ['C++', 'cpp', 'red', 110], ['Content Pipeline', 'content', 'green', 80], ['Reading', undefined, undefined, 100]]
  const kinds = ['note', 'note', 'note', 'note', 'quote', 'word', 'link', 'decision', 'experiment', 'todo']
  const nodes = [], edges = []
  for (const [name, tagName, tint, size] of topics) {
    const hub = nodes.length
    nodes.push({ type: 'capture', id: `n${hub}`, title: `MOC - ${name}`, kind: 'note', links: 0, ...(tagName ? { tag: tagName, tint } : {}) })
    const subs = []
    for (let i = 1; i < size; i++) {
      const at = nodes.length
      nodes.push({ type: 'capture', id: `n${at}`, title: `${name} note ${i}`, kind: kinds[Math.floor(random() * kinds.length)], links: 0, ...(tagName && random() > 0.15 ? { tag: tagName, tint } : {}) })
      if (i < 8) (subs.push(at), edges.push([`n${hub}`, `n${at}`, 2]))
      else edges.push([random() < 0.45 ? `n${hub}` : `n${subs[Math.floor(random() * subs.length)]}`, `n${at}`, 1])
      if (random() < 0.12) edges.push([`n${at}`, `n${hub + 1 + Math.floor(random() * (at - hub))}`, 1])
    }
  }
  for (let i = 0; i < 40; i++) edges.push([`n${Math.floor(random() * nodes.length)}`, `n${Math.floor(random() * nodes.length)}`, 1])
  const seen = new Set()
  const ok = edges.filter(([a, b]) => a !== b && !seen.has(`${a} ${b}`) && seen.add(`${a} ${b}`))
  for (const [a, b] of ok) (nodes[+a.slice(1)].links++, nodes[+b.slice(1)].links++)
  ipcMain.removeHandler('haligtree:notes:graph:all')
  ipcMain.handle('haligtree:notes:graph:all', () => ({ nodes, edges: ok, alone: 12, lonely: [] }))
  return [nodes.length, ok.length]
})

try {
  if (only.has('map')) {
    const [n, e] = await bigMap()
    console.log(`big map: ${n} notes, ${e} links`)
    // Each drawing timed from the canvas's clear to the end of that task.
    await h.evaluate(() => {
      const proto = CanvasRenderingContext2D.prototype, clear = proto.clearRect
      window.__draws = []
      proto.clearRect = function (...a) { if (this.canvas.isConnected && this.canvas.width > 600) { const t = performance.now(); queueMicrotask(() => window.__draws.push(performance.now() - t)) } return clear.apply(this, a) }
    })
    for (const theme of ['paper', 'github']) {
      await c.theme(theme)
      await bigMap()
      await h.evaluate(() => {
        const proto = CanvasRenderingContext2D.prototype, clear = proto.clearRect
        window.__draws = []
        proto.clearRect = function (...a) { if (this.canvas.isConnected && this.canvas.width > 600) { const t = performance.now(); queueMicrotask(() => window.__draws.push(performance.now() - t)) } return clear.apply(this, a) }
      })
      await go('map')
      await h.waitForTimeout(5000)
      await h.mouse.move(5, 5)
      await h.waitForTimeout(400)
      await h.screenshot({ path: `${dir}/${tag}-map-${theme}.png` })
      const box = await h.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })
      // Found by name: the map glides to it, lit with its neighbours, the rest faded.
      const find = await h.$('[data-map-find]')
      check(!!find, `${theme}: the Map has a find box`)
      if (find) {
        await find.click()
        await h.keyboard.type('MOC - Math')
        await h.waitForTimeout(250)
        await h.keyboard.press('Enter')
        await h.waitForTimeout(1300)
        await h.screenshot({ path: `${dir}/${tag}-map-${theme}-found.png` })
        const lit = await h.evaluate(() => document.querySelector('canvas')?.dataset.lit ?? null)
        check(lit === 'MOC - Math', `${theme}: finding a note glides to it and lights it (lit: ${lit})`)
        // Pointed at, it stays lit; the Fit button glides back to the whole map.
        await h.mouse.move(box[0] + box[2] / 2, box[1] + box[3] / 2)
        await h.waitForTimeout(500)
        await h.screenshot({ path: `${dir}/${tag}-map-${theme}-hover.png` })
        await h.mouse.move(5, 5)
        await h.locator('section header button').last().click()
        await h.waitForTimeout(900)
        check(!(await h.evaluate(() => document.querySelector('canvas')?.dataset.lit)), `${theme}: Fit glides back to the whole map and lets the light go`)
      }
      if (theme === 'paper') {
        await h.evaluate(() => (window.__draws = []))
        for (let i = 0; i < 60; i++) { await h.mouse.move(box[0] + box[2] * (0.2 + i / 100), box[1] + box[3] * 0.5); await h.waitForTimeout(16) }
        const took = (await h.evaluate(() => window.__draws)).sort((a, b) => a - b)
        const p95 = took[Math.floor(took.length * 0.95)] ?? 0
        console.log(`pointer moving: ${took.length} drawings, median ${took[Math.floor(took.length / 2)]?.toFixed(2)}ms, 95th ${p95.toFixed(2)}ms`)
        check(p95 < 16, `a frame with ${n} dots draws in under 16ms (95th ${p95.toFixed(1)}ms)`)
        await h.mouse.move(5, 5)
        // Zoomed in on the middle: more names, icons in the dots.
        await h.mouse.move(box[0] + box[2] / 2, box[1] + box[3] / 2)
        await h.keyboard.down('Meta'); for (let i = 0; i < 5; i++) { await h.mouse.wheel(0, -40); await h.waitForTimeout(40) } await h.keyboard.up('Meta')
        await h.mouse.move(5, 5)
        await h.waitForTimeout(900)
        await h.screenshot({ path: `${dir}/${tag}-map-${theme}-zoomed.png` })
      }
    }
  }
  if (only.has('stats')) {
    // The Stats preview in the sidebar: bars in the page's ink, the last in the accent.
    for (const theme of ['paper', 'github']) {
      await c.theme(theme)
      await go('home')
      const row = h.getByRole('button', { name: 'Stats', exact: true }).first()
      if (!(await row.isVisible().catch(() => false))) { await h.getByRole('button', { name: 'More' }).first().click(); await h.waitForTimeout(600) }
      await h.mouse.move(900, 400)
      await h.waitForTimeout(600)
      await row.hover()
      await h.waitForTimeout(1600)
      const bars = await h.evaluate(() => [...document.querySelectorAll('span.flex-1.rounded-sm')].map((one) => getComputedStyle(one).backgroundColor))
      const accent = await h.evaluate(() => { const i = document.createElement('i'); i.style.color = 'var(--tt-brand-color-400)'; document.body.append(i); const said = getComputedStyle(i).color; i.remove(); return said })
      check(bars.length === 14 && bars.at(-1) === accent, `${theme}: the Stats preview's last bar is the theme's accent (${bars.at(-1)} vs ${accent})`)
      const box = await row.boundingBox()
      await h.screenshot({ path: `${dir}/${tag}-stats-peek-${theme}.png`, clip: { x: 0, y: Math.max(0, box.y - 140), width: 760, height: 380 } })
      await h.mouse.move(900, 5)
    }
  }
  if (only.has('scroll')) {
    // Every box that scrolls inside a smooth-scrolling page takes the wheel itself; the page stays put.
    await c.theme('paper')
    await go('settings')
    const sections = await h.$$eval('[data-section]', (all) => all.map((one) => one.dataset.section))
    let boxes = 0
    for (const section of sections) {
      await h.click(`[data-section="${section}"]`)
      await h.waitForTimeout(700)
      const count = await h.evaluate(() => {
        const scrolls = (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 4
        const page = document.querySelector('.lenis') ?? [...document.querySelectorAll('*')].find(scrolls)
        window.__inner = [...(page?.querySelectorAll('*') ?? [])].filter((el) => scrolls(el) && el.clientHeight > 40)
        window.__page = page
        return window.__inner.length
      })
      for (let i = 0; i < count; i++) {
        const at = await h.evaluate((i) => {
          const el = window.__inner[i]
          el.scrollIntoView({ block: 'center' })
          el.scrollTop = 0
          const r = el.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: el.textContent.trim().slice(0, 40) }
        }, i)
        await h.waitForTimeout(500)
        const before = await h.evaluate((i) => [window.__inner[i].scrollTop, window.__page.scrollTop], i)
        await h.mouse.move(at.x, at.y)
        await h.mouse.wheel(0, 90)
        await h.waitForTimeout(600)
        const after = await h.evaluate((i) => [window.__inner[i].scrollTop, window.__page.scrollTop], i)
        boxes++
        check(after[0] > before[0] && Math.abs(after[1] - before[1]) < 2, `${section}: the wheel over “${at.name}” scrolls that box (${before[0]} → ${after[0]}), not the page (${before[1]} → ${after[1]})`)
      }
    }
    check(boxes > 0, `found ${boxes} inner scroll boxes in Settings`)
    // The Scroll sample in Sounds, by name.
    await h.click('[data-section="Sound"]').catch(() => undefined)
    await h.waitForTimeout(700)
    const sample = h.locator('div.overflow-y-auto:has-text("A line of a long excerpt, number 1")').first()
    if (await sample.count()) {
      await sample.scrollIntoViewIfNeeded()
      await h.waitForTimeout(400)
      await sample.evaluate((el) => (el.scrollTop = 0))
      const b = await sample.boundingBox()
      await h.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
      await h.mouse.wheel(0, 120)
      await h.waitForTimeout(600)
      check((await sample.evaluate((el) => el.scrollTop)) > 0, 'Sound: the “Scroll” sample scrolls under the wheel')
      await h.screenshot({ path: `${dir}/${tag}-scroll-sample.png`, clip: { x: b.x - 40, y: b.y - 60, width: b.width + 80, height: b.height + 100 } })
    } else check(false, 'Sound: the “Scroll” sample is there')
  }
  if (only.has('settings')) {
    // Scenery from a folder of pictures, so the strips and the Dimness preview have something to show.
    const pics = process.env.PICS
    for (const theme of ['paper', 'github']) {
      await c.theme(theme)
      if (pics) await c.v('settings:set', { scenery: true, sceneryFolders: [pics] })
      await go('settings')
      await h.click('[data-section="Appearance"]')
      await h.waitForTimeout(900)
      const choice = h.locator('[data-cover-choice]')
      check(await choice.count() === 1, `${theme}: Covers is a visual choice`)
      if (await choice.count()) {
        await choice.scrollIntoViewIfNeeded()
        await h.click('[data-cover-option="gradients"]')
        await h.waitForTimeout(900)
        check(await h.locator('[data-cover-folder]').count() === 1, `${theme}: the folder choice shows under Gradients`)
        const tiles = await choice.locator('[data-cover-option="gradients"] img').count()
        check(tiles >= 4, `${theme}: Gradients shows four covers with no folder needed (${tiles})`)
        const all = await h.locator('[data-cover-choice]').evaluate((el) => el.closest('[data-setting]').getBoundingClientRect().toJSON())
        await h.screenshot({ path: `${dir}/${tag}-covers-gradients-${theme}.png`, clip: { x: all.x, y: all.y, width: all.width, height: all.height } })
        await h.click('[data-cover-option="paper"]')
        await h.waitForTimeout(900)
        check(await h.locator('[data-cover-folder]').count() === 0, `${theme}: Paper drawings needs no folder`)
        await h.screenshot({ path: `${dir}/${tag}-covers-paper-${theme}.png`, clip: { x: all.x, y: all.y, width: all.width, height: all.height - 50 } })
      }
      await h.click('[data-section="Scenery"]')
      await h.waitForTimeout(2500)
      const strips = h.locator('[data-scenery-folder]')
      if (pics) {
        check(await strips.count() === 1, `${theme}: each Scenery folder has its own row`)
        const shown = await strips.first().locator('img').count()
        check(shown >= 4, `${theme}: a folder shows a strip of its own pictures (${shown})`)
        const r = await h.evaluate(() => document.querySelector('[data-scenery-folder]').closest('[data-setting]').getBoundingClientRect().toJSON())
        await h.screenshot({ path: `${dir}/${tag}-scenery-folders-${theme}.png`, clip: { x: r.x, y: r.y, width: r.width, height: r.height } })
      }
      const preview = h.locator('[data-dim-preview]')
      check(await preview.count() === 1, `${theme}: Dimness has a preview`)
      if (await preview.count()) {
        await preview.scrollIntoViewIfNeeded()
        const row = await h.evaluate(() => document.querySelector('[data-dim-preview]').closest('[data-setting]').getBoundingClientRect().toJSON())
        const veil = () => h.evaluate(() => getComputedStyle(document.querySelector('[data-dim-preview] img + div')).backgroundImage)
        const was = pics ? await veil() : ''
        // Moved by keys: the preview follows before anything is saved.
        await h.locator('[data-dim-preview]').evaluate((el) => el.closest('[data-setting]').querySelector('[role="slider"]').focus())
        for (let i = 0; i < 4; i++) await h.keyboard.press('ArrowRight')
        await h.waitForTimeout(150)
        if (pics) check((await veil()) !== was, `${theme}: the Dimness preview changes as the slider moves`)
        await h.waitForTimeout(500)
        await h.screenshot({ path: `${dir}/${tag}-dimness-${theme}.png`, clip: { x: row.x, y: row.y, width: row.width, height: row.height } })
        for (let i = 0; i < 4; i++) await h.keyboard.press('ArrowLeft')
        await h.waitForTimeout(500)
      }
    }
  }
  if (only.has('covers')) {
    // No two neighbouring cards wear the same paper drawing.
    for (const theme of ['paper', 'github']) {
      await c.theme(theme)
      await c.v('settings:set', { coverStyle: 'paper' })
      await go('home')
      await h.waitForTimeout(1500)
      const rows = await h.evaluate(() => {
        const out = {}
        for (const heading of [...document.querySelectorAll('h2, h3, span, div')].filter((el) => el.children.length === 0 && /^(Jump back in|From this week)$/.test(el.textContent.trim()))) {
          let box = heading.parentElement
          while (box && !box.querySelector('[data-paper-cover] img')) box = box.parentElement
          if (box) out[heading.textContent.trim()] = [...box.querySelectorAll('[data-paper-cover] img')].map((img) => img.getAttribute('src').split('/').pop())
        }
        return out
      })
      for (const [name, srcs] of Object.entries(rows)) {
        const same = srcs.findIndex((one, n) => n > 0 && one === srcs[n - 1])
        check(srcs.length > 1 && same < 0, `${theme}: ${name}: ${srcs.length} cards, no two side by side share a drawing${same >= 0 ? ` (card ${same} and ${same + 1}: ${srcs[same]})` : ''}`)
      }
      check(Object.keys(rows).length > 0, `${theme}: found Home's card rows (${Object.keys(rows).join(', ')})`)
      await h.evaluate(() => [...document.querySelectorAll('*')].find((el) => el.children.length === 0 && el.textContent.trim() === 'Jump back in')?.scrollIntoView({ block: 'start' }))
      await h.waitForTimeout(1200)
      await h.screenshot({ path: `${dir}/${tag}-home-covers-${theme}.png` })
      for (const place of ['Writing', 'Gems']) {
        await h.locator(`button:has-text("${place}")`).first().click()
        await h.waitForTimeout(1500)
        const srcs = await h.evaluate(() => [...document.querySelectorAll('[data-paper-cover] img')].map((img) => img.getAttribute('src').split('/').pop()))
        const same = srcs.findIndex((one, n) => n > 0 && one === srcs[n - 1])
        check(same < 0, `${theme}: ${place}: ${srcs.length} covers, no two in a row the same`)
        await h.screenshot({ path: `${dir}/${tag}-${place.toLowerCase()}-covers-${theme}.png` })
      }
    }
  }
} finally {
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  console.log(`${passed} passed, ${failed} failed`)
  await c.close()
}
