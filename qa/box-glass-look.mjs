// Quick capture in macOS 26 Spotlight's material (10 Nov: "look how you fell short of the beautiful frosted styling and
// borders"): the Mac's blur under the card, its round controls and the menus that hang from it, each under a wash of
// its page colour with a lit hairline and a wide soft shadow. Checks, dark and light, one line and grown:
//   - the glass is on and cut to the card and each control (and an open "/" list), nothing else;
//   - the card's fill lets it through, and its hairline is brighter along the top edge than down the sides;
//   - every word (the writing, the quiet grey, the empty line's prompt) keeps 4.5:1 over a white and a black desktop
//     coming straight through the wash, the worst case (the Mac's own tint only adds contrast);
//   - Reduce Transparency: no glass and an opaque card.
// With a folder (QA_SHOTS) it also lays the page's own picture (taken off screen, never of the screen) over a busy
// painting and a plain desktop, with the Mac's blur stood in for by the same picture blurred under the glass shapes
// main was told, and keeps frames of the box opening.
//   QA_SHOTS=dir QA_BUSY=picture.jpg QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-glass-look.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const busy = process.env.QA_BUSY ? `data:image/jpeg;base64,${readFileSync(process.env.QA_BUSY).toString('base64')}` : null
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v, electron } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const glass = () => electron.evaluate(({ BrowserWindow }) => {
  const box = (globalThis.haligtreeGlass?.() ?? []).find(([id]) => { const w = BrowserWindow.fromId(id); return w && /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()) })
  return box ? box[1] : null
})
const look = (theme) => page.evaluate((t) => (localStorage.setItem('theme', t), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), theme)

/** Colours as the page draws them, read back as sRGB 0-255 with alpha 0-1. */
const colours = () => page.evaluate(() => {
  const paint = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  const rgba = (css) => { paint.clearRect(0, 0, 1, 1); paint.fillStyle = '#000'; paint.fillStyle = css; paint.fillRect(0, 0, 1, 1); const [r, g, b, a] = paint.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255] }
  const card = document.querySelector('.app-container')
  const s = getComputedStyle(card)
  const empty = card.querySelector('p.is-editor-empty')
  const words = card.querySelector('.ProseMirror p:not(.is-editor-empty)') ?? card.querySelector('.ProseMirror')
  const control = document.querySelector('.mf-top .mf-pill button')
  return {
    fill: rgba(s.backgroundColor),
    ink: rgba(getComputedStyle(words).color),
    quiet: rgba(s.getPropertyValue('--muted-foreground').trim()),
    prompt: empty ? rgba(getComputedStyle(empty, '::before').color) : null,
    control: control ? { fill: rgba(getComputedStyle(control).backgroundColor), ink: rgba(getComputedStyle(control).color) } : null,
    shadow: s.boxShadow,
    radius: parseFloat(s.borderTopLeftRadius),
    glass: document.documentElement.dataset.glass ?? null
  }
})
const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const over = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)]
const ratio = (x, y) => { const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05) }
/** The worst contrast of a colour of words over the fill, with a white and with a black desktop straight through it. */
const worst = (ink, fill) => Math.min(...[[255, 255, 255], [0, 0, 0]].map((desk) => { const ground = over(fill, desk); return ratio(over(ink, ground), ground) }))

/** The page's own picture (alpha kept) over a desktop, the Mac's blur stood in for under the glass shapes. */
async function compose(name, shapes, dark) {
  if (!shots) return
  const png = (await page.screenshot({ omitBackground: true })).toString('base64')
  const scale = await page.evaluate(() => devicePixelRatio)
  const grounds = { busy, plain: dark ? '#26282c' : '#dfe3e8' }
  for (const [kind, ground] of Object.entries(grounds)) {
    if (!ground) continue
    const url = await electron.evaluate(async ({ BrowserWindow }, { png, ground, shapes, scale, dark }) => {
      const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
      await w.loadURL('data:text/html,<body></body>')
      const out = await w.webContents.executeJavaScript(`(async () => {
        const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src })
        const top = await load('data:image/png;base64,${png}')
        const c = document.createElement('canvas'); c.width = top.width; c.height = top.height
        const x = c.getContext('2d')
        const ground = ${JSON.stringify(ground)}
        const desk = (filter) => { x.filter = filter; if (ground.startsWith('#')) { x.fillStyle = ground; x.fillRect(-60, -60, c.width + 120, c.height + 120) } else { const i = window._g; const k = Math.max(c.width / i.width, c.height / i.height) * 1.25; x.drawImage(i, (c.width - i.width * k) / 2 - c.width * 0.1, (c.height - i.height * k) / 2, i.width * k, i.height * k) } x.filter = 'none' }
        if (!ground.startsWith('#')) window._g = await load(ground)
        desk('none')
        const s = ${scale}
        for (const [l, t, wd, ht, r] of ${JSON.stringify(shapes)}) {
          x.save(); x.beginPath(); x.roundRect(l * s, t * s, wd * s, ht * s, r * s); x.clip()
          desk('blur(${30 * scale}px) saturate(1.6)')
          x.fillStyle = ${dark} ? 'rgba(28,28,30,0.45)' : 'rgba(246,246,248,0.45)'; x.fillRect(0, 0, c.width, c.height)
          x.restore()
        }
        x.drawImage(top, 0, 0)
        return c.toDataURL('image/png')
      })()`)
      w.destroy()
      return out
    }, { png, ground, shapes, scale, dark })
    writeFileSync(join(shots, `${name}-${kind}.png`), Buffer.from(url.split(',')[1], 'base64'))
  }
}

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  await page.evaluate(() => window.api.showPrompt()); await wait(900)
  await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(600)

  for (const theme of ['dark', 'light']) {
    await look(theme); await wait(1000)
    const dark = theme === 'dark'
    const pill = await glass()
    const on = await colours()
    const controls = await page.evaluate(() => [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((el) => el.offsetWidth > 0).length)
    check(`${theme} pill: on glass, under the card and each round control`, !!pill && pill.shapes.length === controls + 1 && pill.dark === dark && on.glass === (dark ? 'dark' : 'light'), JSON.stringify({ pill, controls, glass: on.glass }))
    check(`${theme} pill: the card and its controls let the glass through`, on.fill[3] < 0.9 && on.fill[3] > 0.5 && !!on.control && on.control.fill[3] < 0.9, JSON.stringify({ card: on.fill, control: on.control?.fill }))
    check(`${theme} pill: a capsule (radius half its height)`, Math.abs(on.radius - 28) < 0.5, String(on.radius))
    check(`${theme} pill: a lit hairline, brighter at the top, and a wide soft shadow`, /0px 0px 0px 1px inset/.test(on.shadow) && /0px 1px 0px 0px inset/.test(on.shadow) && /0px (22px 56px|24px 60px)/.test(on.shadow), on.shadow)
    const prompt = worst(on.prompt ?? on.quiet, on.fill)
    check(`${theme} pill: the empty line's prompt 4.5:1 over a white or black desktop`, prompt >= 4.5, prompt.toFixed(2))
    const button = worst(on.control.ink, on.control.fill)
    check(`${theme} pill: the round controls' icons 4.5:1`, button >= 4.5, button.toFixed(2))
    await compose(`${theme}-pill`, pill?.shapes ?? [], dark)

    // A "/" list hangs below the pill, opaque: the card's words showed sharp through a frosted one (main.css, Frost).
    await page.click(EDITOR); await page.keyboard.type('/'); await wait(900)
    const listed = await glass()
    // The list's own surface: the one panel inside the popup the "/" opened.
    const list = await page.evaluate(() => {
      const el = [...document.querySelectorAll('.tiptap-suggestion-popup :is(.mf-frost, .tiptap-slash-menu, .tiptap-emoji-list)')].find((one) => one.getBoundingClientRect().height > 20)
      if (!el) return { none: document.querySelector('.tiptap-suggestion-popup')?.innerHTML.slice(0, 300) ?? 'no popup' }
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      const chain = []; for (let at = el.parentElement; at && at !== document.documentElement; at = at.parentElement) { const t = getComputedStyle(at); if (Number(t.opacity) < 1 || t.maskImage !== 'none' || t.filter !== 'none' || t.clipPath !== 'none' || t.backdropFilter !== 'none' || t.mixBlendMode !== 'normal') chain.push(`${at.tagName}.${String(at.className).slice(0, 40)} o${t.opacity} m${t.maskImage.slice(0, 20)} f${t.filter} c${t.clipPath}`) }
      const frosted = [...document.querySelectorAll('.mf-frost, .tiptap-slash-menu, .tiptap-block-menu, .tiptap-emoji-list')].map((one) => { const q = one.getBoundingClientRect(); return `${String(one.className).slice(0, 40)} ${Math.round(q.top)} ${Math.round(q.height)}` })
      return { box: [r.left, r.top, r.width, r.height].map((n) => Math.round(n)), fill: s.backgroundColor, blur: s.backdropFilter, off: el.hasAttribute('data-frost-off'), cls: el.className.slice(0, 60), chain, frosted }
    })
    const under = !!list?.box && !!listed && listed.shapes.some((g) => g.slice(0, 4).every((n, i) => Math.abs(n - list.box[i]) <= 2))
    const seeThrough = /\/\s*0?\.\d|rgba\([^)]*,\s*0?\.\d+\)/.test(list?.fill ?? '')
    check(`${theme}: the "/" list is opaque, no blur and no glass under it`, !!list?.box && !seeThrough && list.blur === 'none' && !under, JSON.stringify({ list, shapes: listed?.shapes }))
    await compose(`${theme}-pill-list`, listed?.shapes ?? [], dark)
    await page.keyboard.press('Escape'); await wait(300)
    await page.keyboard.press('Backspace'); await wait(500)

    // Grown: the glass follows the card.
    await page.keyboard.type('The world is on fire'); await page.keyboard.press('Enter'); await page.keyboard.type('and the sea is the colour of wine, said the man by the door.'); await wait(1100)
    const grown = await glass()
    const g = await colours()
    const card = await page.evaluate(() => { const r = document.querySelector('.app-container').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n)) })
    check(`${theme} grown: the card's glass is the card's own size`, !!grown && grown.shapes.some((s) => Math.abs(s[2] - card[2]) <= 1 && Math.abs(s[3] - card[3]) <= 1), JSON.stringify({ shapes: grown?.shapes, card }))
    check(`${theme} grown: large soft corners`, Math.abs(g.radius - 24) < 0.5, String(g.radius))
    const ink = worst(g.ink, g.fill)
    const quiet = worst(g.quiet, g.fill)
    check(`${theme} grown: the writing 4.5:1 over a white or black desktop`, ink >= 4.5, ink.toFixed(2))
    check(`${theme} grown: quiet grey words 4.5:1`, quiet >= 4.5, quiet.toFixed(2))
    await compose(`${theme}-grown`, grown?.shapes ?? [], dark)
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(800)
  }

  // Reduce Transparency: no glass, every surface opaque.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] })
  await wait(800)
  const solid = await glass()
  const s = await colours()
  check('Reduce Transparency: no glass, the card and its controls opaque', !!solid && solid.shapes.length === 0 && s.fill[3] === 1 && s.control?.fill[3] === 1 && !s.glass, JSON.stringify({ solid, fill: s.fill, control: s.control }))
  await compose('light-pill-reduce-transparency', [], false)
  await cdp.send('Emulation.setEmulatedMedia', { features: [] })
  await wait(800)
  check('Reduce Transparency off: the glass comes back', ((await glass())?.shapes.length ?? 0) > 0)

  // Frames of it opening, every one the page draws for its first half second.
  if (shots) {
    await look('dark'); await wait(800)
    await page.evaluate(() => window.api.hidePrompt?.()); await wait(700)
    await page.evaluate(() => window.api.showPrompt())
    const start = Date.now()
    for (let n = 0; Date.now() - start < 500; n++) {
      const png = await page.screenshot({ omitBackground: true })
      writeFileSync(join(shots, `open-${String(n).padStart(2, '0')}-${Date.now() - start}ms.png`), png)
    }
  }
} finally {
  await c.close?.()
  await done?.()
}
