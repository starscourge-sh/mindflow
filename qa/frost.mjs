// Frosted menus and pop-ups in the main window (queue 3 Nov, batch 5). Each floating surface (a right-click menu, a
// menu button's menu, a tip, a note's hover card, Display as a popover and as a sheet, ⌘K) is opened over a busy
// picture, light and dark, and checked: a real backdrop blur under a fill that lets some of the page through; at no
// frame of its opening anything round it that fades (opacity under 1), masks, clips or filters (the blur would see
// nothing there and the page would show through sharp); and opaque under Reduce Transparency. Then, in every theme,
// the words on the frost over the brightest and darkest page stay as readable as the craft floor asks.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/frost.mjs
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.QA_SHOTS ?? '/tmp/haligtree-frost'
mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 820 })
const { h, v, go, look, send } = c
const ED = '.note-pane .tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const wait = (ms) => h.waitForTimeout(ms)
const cdp = await h.context().newCDPSession(h)
const transparency = (reduce) => cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: reduce ? 'reduce' : 'no-preference' }] })

// A busy picture under everything that floats: bright and dark stripes, colour, and words, so frost or its absence shows.
const busy = () => h.evaluate(() => {
  document.querySelector('[data-qa-busy]')?.remove()
  const canvas = Object.assign(document.createElement('canvas'), { width: innerWidth, height: innerHeight })
  const pen = canvas.getContext('2d')
  for (let x = 0; x < innerWidth; x += 36) { pen.fillStyle = `hsl(${(x * 2) % 360} 85% ${x % 72 ? 25 : 75}%)`; pen.fillRect(x, 0, 36, innerHeight) }
  pen.font = 'bold 22px sans-serif'
  for (let y = 30; y < innerHeight; y += 34) { pen.fillStyle = y % 68 ? '#fff' : '#000'; pen.fillText('THE PAGE UNDER THE MENU SHOULD BLUR, NEVER READ SHARP THROUGH IT '.repeat(3), (y * 3) % 90 - 90, y) }
  canvas.setAttribute('data-qa-busy', '')
  Object.assign(canvas.style, { position: 'fixed', inset: '0', zIndex: '45', pointerEvents: 'none' })
  document.body.append(canvas)
})

// Watches every frame from now until read: each surface matching `sel`, and everything round it.
const watch = (sel) => h.evaluate((sel) => {
  const log = (window.__frost = { broken: [], seen: 0 })
  const until = performance.now() + 4000
  const frame = () => {
    for (const el of document.querySelectorAll(sel)) {
      if (!el.getBoundingClientRect().width) continue
      log.seen++
      for (let at = el.parentElement; at; at = at.parentElement) {
        const s = getComputedStyle(at)
        const why = Number(s.opacity) < 1 ? `opacity ${Number(s.opacity).toFixed(2)}` : s.maskImage !== 'none' ? 'mask' : s.filter !== 'none' ? `filter ${s.filter}` : s.clipPath !== 'none' ? 'clip-path' : s.backdropFilter !== 'none' ? 'backdrop-filter' : s.mixBlendMode !== 'normal' ? 'blend' : ''
        if (why) log.broken.push(`${at.tagName.toLowerCase()}${at.className && typeof at.className === 'string' ? '.' + at.className.split(' ').slice(0, 3).join('.') : ''}: ${why}`)
      }
    }
    if (performance.now() < until) requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}, sel)

const alpha = (colour) => { const m = colour.match(/\/\s*([\d.]+)\s*\)$/) ?? colour.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/); return m ? Number(m[1]) : 1 }
const material = (sel) => h.evaluate((sel) => {
  const el = [...document.querySelectorAll(sel)].find((one) => one.getBoundingClientRect().width)
  if (!el) return null
  const s = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return { bg: s.backgroundColor, blur: s.backdropFilter, box: [r.left, r.top, r.width, r.height].map(Math.round) }
}, sel)

const shut = async () => { await h.keyboard.press('Escape'); await wait(300); await h.mouse.move(600, 790); await wait(200) }
let note
let page
// A note open in the main window, its last line clicked into, for the editor's own menus.
const inNote = async () => {
  await send('capture', page)
  await h.locator(ED).waitFor({ timeout: 10000 })
  await wait(1200)
  await h.locator(`${ED} p`, { hasText: 'Negligence needs' }).first().click()
  await h.keyboard.press('End')
}
const visible = (sel) => h.locator(sel).filter({ visible: true }).first()
const SURFACES = [
  ['a right-click menu', '[data-slot="context-menu-content"]', async () => {
    const row = visible('[data-slot="context-menu-trigger"]:not(aside *)')
    const r = await row.boundingBox()
    await h.mouse.click(r.x + 40, r.y + r.height / 2, { button: 'right' })
  }],
  ['a menu button\'s menu', '[data-slot="dropdown-menu-content"]', async () => { await visible('[data-slot="dropdown-menu-trigger"]').click() }],
  ['a tip', '[data-slot="tooltip-content"]', async () => {
    const r = await visible('[data-slot="tooltip-trigger"]').boundingBox()
    await h.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 3 })
  }],
  ['a note\'s hover card', '[data-note-preview]', async () => {
    await h.evaluate((id) => { const s = Object.assign(document.createElement('span'), { textContent: 'a note' }); s.setAttribute('data-note-hover', ''); s.setAttribute('data-note', `nugget:${id}`); s.setAttribute('data-qa-note', ''); Object.assign(s.style, { position: 'fixed', left: '420px', top: '260px', zIndex: 46 }); document.body.append(s) }, note)
    const r = await h.locator('[data-qa-note]').boundingBox()
    await h.mouse.move(r.x - 20, r.y - 20)
    await h.mouse.move(r.x + 6, r.y + r.height / 2, { steps: 4 })
  }],
  ['Display as a popover', '[data-slot="popover-content"]', async () => { await visible('[data-display]').click() }],
  ['Display as a sheet', '[data-slot="sheet-content"]', async () => {
    await h.evaluate(() => document.querySelectorAll('[data-display]').forEach((one) => (one.style.display = 'none')))
    await h.keyboard.press('f')
  }],
  ['the editor\'s right-click menu', '.tiptap-block-menu', async () => {
    await inNote()
    await h.locator(`${ED} p`, { hasText: 'Negligence needs' }).first().click({ button: 'right', position: { x: 30, y: 6 } })
  }],
  ['the editor\'s / menu', '.tiptap-slash-menu', async () => {
    await inNote()
    await h.keyboard.press('Enter')
    await h.keyboard.type('/')
  }],
  ['⌘K', '[role="dialog"][aria-label="Search"] > div', async () => {
    await h.keyboard.press('Meta+k')
  }]
]

try {
  await v('settings:set', { hintRate: 0 })
  note = (await v('feed')).posts.find((one) => one.type === 'nugget')?.id
  page = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Negligence needs a breach of duty.' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Duty, breach, cause, harm.' }] }] } }))
  for (const theme of ['light', 'dark']) {
    await look(theme)
    for (const [name, sel, open] of SURFACES) {
      await go('articles')
      await wait(500)
      await h.mouse.move(600, 790)
      await busy()
      await watch(sel)
      try { await open() } catch (error) { check(`${theme}, ${name}: opens`, false, String(error).slice(0, 120)); continue }
      // Some surfaces (⌘K, a hover card) live in the app's own layer, under a picture laid over the body: the picture
      // goes in just under the surface's own fixed layer instead, so it is what the frost has to blur.
      await h.waitForSelector(sel, { timeout: 3000 }).catch(() => {})
      await h.evaluate((sel) => {
        const el = [...document.querySelectorAll(sel)].find((one) => one.getBoundingClientRect().width)
        let layer = el
        while (layer && getComputedStyle(layer).position !== 'fixed') layer = layer.parentElement
        const picture = document.querySelector('[data-qa-busy]')
        if (!layer || !picture) return
        picture.style.zIndex = String((parseInt(getComputedStyle(layer).zIndex) || 50) - 1)
        layer.before(picture)
      }, sel)
      // Frames through the opening, every 50ms.
      for (let i = 0; i < 4; i++) { await h.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z]+/gi, '-')}-${theme}-${i}.png` }); await wait(50) }
      await wait(700)
      const log = await h.evaluate(() => window.__frost)
      const m = await material(sel)
      check(`${theme}, ${name}: opens`, !!m && log.seen > 0)
      if (!m) { await shut(); continue }
      check(`${theme}, ${name}: frosted, the page blurred under a fill it shows through`, /blur\(/.test(m.blur) && alpha(m.bg) < 1 && alpha(m.bg) >= 0.7, `${m.blur}; ${m.bg}`)
      const broken = [...new Set(log.broken)]
      check(`${theme}, ${name}: nothing round it fades, masks, clips or filters, in any frame of its opening`, broken.length === 0, broken.slice(0, 4).join('; '))
      await h.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z]+/gi, '-')}-${theme}.png` })
      if (theme === 'light') {
        await transparency(true)
        await wait(500) // past any colour transition on the surface
        const solid = await material(sel)
        check(`${name}: opaque under Reduce Transparency`, solid && alpha(solid.bg) === 1 && solid.blur === 'none', solid && `${solid.blur}; ${solid.bg}`)
        await transparency(false)
      }
      await shut()
      await h.evaluate(() => { document.querySelectorAll('[data-qa-note], [data-qa-busy]').forEach((one) => one.remove()); document.querySelectorAll('[data-display]').forEach((one) => (one.style.display = '')) })
    }
  }

  // A frosted surface put inside a masked, a fading and a filtered parent keeps the whole fill; one beside them frosts.
  await look('light')
  const kept = await h.evaluate(async () => {
    const make = (style) => {
      const wrap = Object.assign(document.createElement('div'), { className: 'fixed' })
      Object.assign(wrap.style, { left: '0', top: '0', ...style })
      const surface = Object.assign(document.createElement('div'), { className: 'mf-frost bg-popover', textContent: 'x' })
      wrap.append(surface)
      document.body.append(wrap)
      return [wrap, surface]
    }
    const made = { masked: make({ maskImage: 'linear-gradient(black, transparent)' }), fading: make({ opacity: '0.5' }), filtered: make({ filter: 'blur(1px)' }), free: make({}) }
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    const out = Object.fromEntries(Object.entries(made).map(([k, [, s]]) => [k, `${getComputedStyle(s).backdropFilter}; ${getComputedStyle(s).backgroundColor}`]))
    Object.values(made).forEach(([w]) => w.remove())
    return out
  })
  for (const where of ['masked', 'fading', 'filtered']) check(`inside a ${where} parent, a frosted surface stays opaque`, /^none; /.test(kept[where]) && alpha(kept[where].split('; ')[1]) === 1, kept[where])
  check('beside them, the same surface is frosted', /blur\(/.test(kept.free), kept.free)

  // The words on the frost, in every theme, over the brightest and the darkest page.
  // Every built-in theme (lib/theme.ts THEMES).
  const all = ['github', 'midnight', 'paper', 'dark', 'light', 'catppuccin', 'dracula', 'gruvbox', 'tokyonight', 'obsidian-nord', 'everforest', 'kanagawa', 'adwaita', 'rose-pine']
  for (const theme of all) {
    await h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(250)
    const read = await h.evaluate(() => {
      const el = Object.assign(document.createElement('div'), { className: 'mf-frost bg-popover' })
      document.body.append(el)
      const fill = getComputedStyle(el).backgroundColor
      const quiet = getComputedStyle(el).getPropertyValue('--muted-foreground').trim()
      el.remove()
      const root = getComputedStyle(document.documentElement)
      const pen = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })
      const rgb = (...layers) => { pen.clearRect(0, 0, 1, 1); for (const f of layers) { pen.fillStyle = f; pen.fillRect(0, 0, 1, 1) } return [...pen.getImageData(0, 0, 1, 1).data].slice(0, 3) }
      const lum = ([r, g, b]) => { const f = (x) => (x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
      const ink = (name, under) => rgb(under, root.getPropertyValue(name).trim())
      const out = {}
      for (const [label, under] of [['opaque', root.getPropertyValue('--popover').trim()], ['over white', '#fff'], ['over black', '#000']]) {
        const back = label === 'opaque' ? rgb(under) : rgb(under, fill)
        // On the frost its own quiet ink (main.css lifts it); on the opaque menu the theme's.
        out[label] = { text: ratio(ink('--popover-foreground', `rgb(${back})`), back), quiet: ratio(rgb(`rgb(${back})`, label === 'opaque' ? root.getPropertyValue('--muted-foreground').trim() : quiet), back) }
      }
      return out
    })
    const worst = (k) => Math.min(read['over white'][k], read['over black'][k])
    check(`${theme}: words on the frost read (4.5:1 or better over any page)`, worst('text') >= 4.5, `text ${worst('text').toFixed(1)} (opaque ${read.opaque.text.toFixed(1)}), quiet words ${worst('quiet').toFixed(1)} (opaque ${read.opaque.quiet.toFixed(1)})`)
    check(`${theme}: quiet words on the frost no fainter than on the opaque menu, less a tenth`, worst('quiet') >= Math.min(4.5, read.opaque.quiet * 0.9), `${worst('quiet').toFixed(2)} vs ${read.opaque.quiet.toFixed(2)}`)
  }
  if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
} finally {
  await c.close()
}
const pass = results.filter(Boolean).length
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
