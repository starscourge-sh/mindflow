// What a render costs on a long list and over the welcome, the three things that froze the main window on 11 Nov
// (~/Library/Logs/Haligtree/freeze-main-window-2026-11-11T*.txt):
//   1. the welcome's gradient read the theme's colours off the page (getComputedStyle) on every render;
//   2. lib/fade-fits.ts measured every faded list in the window (scrollHeight) on any change anywhere;
//   3. every row built its whole right-click menu on every render.
// Counted as reads of the page (getComputedStyle, scrollHeight) and timed as the frames' work (long animation frames
// over 50 ms, their script and their forced layout), with 500 gems in the book. Run it on the built app and on a
// development build (React's development mode, as `npm run dev`):
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/render-cost.mjs
//   npx electron-vite build --config electron.vite.dev-qa.config.ts --outDir out-dev
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-dev/main/index.js HALIGTREE_QA_AWAY=1 node qa/render-cost.mjs
// QA_PROFILE=1 prints the costliest functions of each step (names survive in the development build).
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const N = 500

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

// The sandbox's book made once, then 500 gems written into it while the app is shut (as qa/big-group-speed.mjs does).
const first = await sandbox({ width: 1300, height: 900, seeded: true })
await first.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
await first.close()
const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))
db.exec('begin')
const add = db.prepare("insert into nuggets (id, tier, kind, title, body, created_at, updated_at) values (?, 'nugget', 'note', '', ?, ?, ?)")
for (let i = 0; i < N; i++) {
  const at = new Date(Date.now() - i * 60000).toISOString()
  add.run(randomUUID(), JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Long list gem ${i + 1}` }] }] }), at, at)
}
db.exec('commit')
db.close()

const c = await sandbox({ width: 1300, height: 900, seeded: false })
const { h } = c
const wait = (ms) => h.waitForTimeout(ms)
const cdp = process.env.QA_PROFILE ? await c.electron.context().newCDPSession(h) : null
const profile = {
  start: async () => { if (!cdp) return; await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start') },
  stop: async (name) => {
    if (!cdp) return
    const { profile } = await cdp.send('Profiler.stop')
    const byId = new Map(profile.nodes.map((node) => [node.id, node]))
    const parent = new Map()
    for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id)
    const self = new Map()
    profile.samples.forEach((id, at) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[at] ?? 0)))
    const where = (node) => `${node.callFrame.functionName || '(anon)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`
    const total = new Map()
    for (const [id, us] of self) {
      const seen = new Set()
      for (let at = id; at; at = parent.get(at)) { const key = where(byId.get(at)); if (!seen.has(key)) (seen.add(key), total.set(key, (total.get(key) ?? 0) + us)) }
    }
    const wanted = /^(RowMenu|lines|fits|nest|paletteNow|paletteRead|lightNow|lightRead|resolve|mix|mark|measure|flush|GrainBackdrop|menuFor) /
    console.log(`  profile ${name}:\n${[...total].filter(([k]) => wanted.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, us]) => `    ${(us / 1000).toFixed(1).padStart(7)}ms  ${k}`).join('\n') || '    (none of the watched functions ran)'}`)
  }
}

// Reads of the page counted, and the frames' work, from now until read.
const arm = () => h.evaluate(() => {
  if (!window.__counted) {
    window.__counted = true
    window.__reads = { style: 0, height: 0, colours: 0 }
    // The welcome's colours were read by putting a hidden mark in the page with a colour mix, and reading it back.
    new MutationObserver((changes) => changes.forEach((one) => one.addedNodes.forEach((node) => node.nodeName === 'I' && node.style?.color.includes('color-mix') && window.__reads.colours++))).observe(document.body, { childList: true })
    const style = window.getComputedStyle
    window.getComputedStyle = function (...args) { window.__reads.style++; return style.apply(this, args) }
    const height = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight')
    Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get() { window.__reads.height++; return height.get.call(this) } })
    window.__frames = []
    new PerformanceObserver((list) => list.getEntries().forEach((one) => window.__frames.push(one))).observe({ type: 'long-animation-frame', buffered: false })
  }
  window.__reads.style = 0
  window.__reads.height = 0
  window.__reads.colours = 0
  window.__frames.length = 0
})
const read = () => h.evaluate(() => {
  const frames = window.__frames.splice(0)
  const work = frames.reduce((sum, one) => sum + one.duration, 0)
  const layout = frames.reduce((sum, one) => sum + one.scripts.reduce((s, x) => s + x.forcedStyleAndLayoutDuration, 0), 0)
  return { colours: window.__reads.colours, style: window.__reads.style, height: window.__reads.height, frames: frames.length, work: Math.round(work), worst: Math.round(Math.max(0, ...frames.map((one) => one.duration))), forced: Math.round(layout) }
})
const say = (name, r) => console.log(`  ${name}: colours read ${r.colours}, getComputedStyle ${r.style}, scrollHeight ${r.height}, long frames ${r.frames} (${r.work} ms in all, worst ${r.worst} ms, forced layout ${r.forced} ms)`)
const out = {}

try {
  await c.v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await h.evaluate(() => localStorage.setItem('view:nugget', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  await h.reload(); await wait(2500)

  // 1. The welcome open, its pages turned: each turn renders the gradient. The theme does not change, so its colours
  // need reading at most once.
  await h.evaluate(() => window.dispatchEvent(new Event('haligtree:welcome')))
  await wait(4000)
  const open = await h.locator('.mf-welcome').count()
  check('the welcome opened', open > 0)
  await arm(); await profile.start()
  for (let i = 0; i < 8; i++) {
    await h.evaluate((by) => window.dispatchEvent(new CustomEvent('haligtree:welcome-step', { detail: by })), i % 2 ? -1 : 1)
    await wait(700)
  }
  out.welcome = await read(); await profile.stop('welcome turns')
  say('welcome, 8 page turns', out.welcome)
  check('welcome: turning its pages reads no colours off the page (the theme did not change)', out.welcome.colours === 0, `${out.welcome.colours} colours read`)
  // A theme change is still followed: the gradient's colours read again.
  const before = await h.evaluate(() => document.querySelector('.mf-welcome')?.getAttribute('data-page'))
  await arm()
  await c.look('dark'); await wait(500)
  const dark = await h.evaluate(() => document.querySelector('.mf-welcome')?.getAttribute('data-page'))
  const again = (await read()).colours
  check('welcome: a new theme has its colours read again, once', again > 0 && again <= 10, `${again} colours read`)
  await c.look('light'); await wait(500)
  const light = await h.evaluate(() => document.querySelector('.mf-welcome')?.getAttribute('data-page'))
  check('welcome: the theme changed, the welcome follows it (dark words on light, light on dark)', dark === 'dark' && light === 'light', `${before} -> dark ${dark} -> light ${light}`)
  await h.reload(); await wait(2500)

  // 2. Changes away from any faded list (a mark added to the page, one a frame): no faded list is measured.
  await c.go('nuggets'); await wait(2500)
  await arm(); await profile.start()
  await h.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => done()))
    for (let i = 0; i < 30; i++) {
      const mark = document.createElement('i')
      mark.style.display = 'none'
      document.body.append(mark)
      await frame()
      mark.remove()
      await frame()
    }
    await new Promise((done) => setTimeout(done, 300))
  })
  out.away = await read(); await profile.stop('changes away from lists')
  const faded = await h.evaluate(() => document.querySelectorAll('.mf-more, .mf-fade-end, .page-dock-side, .page-dock-scroll').length)
  say(`60 changes away from the ${faded} faded lists`, out.away)
  check('changes away from every faded list measure none of them', out.away.height === 0, `${out.away.height} scrollHeight reads`)

  // 3. The 500-gem list: select all and back, each re-rendering every row drawn.
  await h.locator('[data-page="nuggets"] [data-row]').first().click(); await wait(500)
  await h.evaluate(() => document.activeElement?.blur())
  await arm(); await profile.start()
  for (let i = 0; i < 5; i++) {
    await h.keyboard.press('Meta+a'); await wait(500)
    await h.keyboard.press('Escape'); await wait(500)
  }
  out.list = await read(); await profile.stop('select all x5')
  say('gems (500), ⌘A and Escape five times', out.list)
  // The list scrolled through: rows come and go inside one faded list, which alone is measured.
  await arm(); await profile.start()
  await h.evaluate(async () => {
    let box = document.querySelector('[data-page="nuggets"] [data-row]')
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
    for (let i = 0; i < 20; i++) { box.scrollTop += 400; await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))) }
    await new Promise((done) => setTimeout(done, 300))
  })
  out.scroll = await read(); await profile.stop('scroll')
  say('gems (500), scrolled 20 steps', out.scroll)

  // 4. Home and back, three times: every shelf's rows drawn.
  await arm(); await profile.start()
  for (let i = 0; i < 3; i++) { await c.go('home'); await wait(800); await c.go('nuggets'); await wait(800) }
  out.pages = await read(); await profile.stop('home and gems x3')
  say('Home and Gems, three times each', out.pages)

  // A row's menu still opens with its lines, and its keys still work while it is open.
  await c.go('nuggets'); await wait(1200)
  const row = h.locator('[data-page="nuggets"] [data-row]').nth(2)
  await row.click({ button: 'right' }); await wait(500)
  const lines = await h.locator('[data-slot="context-menu-content"] [role="menuitem"]').count()
  check('a row right-clicked opens its menu, its lines built as it opens', lines > 3, `${lines} lines`)
  await h.keyboard.press('Escape'); await wait(400)
  check('Escape closes it', (await h.locator('[data-slot="context-menu-content"]').count()) === 0)
} finally {
  console.log(`RESULT ${JSON.stringify(out)}`)
  await c.close()
}
const failed = results.filter((one) => !one).length
console.log(failed ? `\n${failed} FAILED` : '\nALL PASS')
process.exit(failed ? 1 : 0)
