// Quick capture on real glass, Raycast's way: the Mac's blur of what is behind under the card, its round controls and
// its hint, and nowhere else (the clear room round them stays clear); the words keep their contrast; Reduce
// Transparency takes the glass away and every surface is opaque again. A picture behind the box stands in for the
// wallpaper (a light one and a dark one), and the screen itself is captured, since a page's own screenshot cannot
// see the Mac's blur: the box comes on screen for a moment for each capture, then goes back out of sight.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/glass.mjs
// With a folder for pictures it captures them, which needs the windows really on screen (they are kept out of
// sight otherwise): HALIGTREE_QA_ONSCREEN=1 ... node qa/glass.mjs shots-dir
import { execFileSync } from 'child_process'
import { mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.argv[2] ?? process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, v, electron } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const ROOT = new URL('../src/renderer/src/assets/scenery/', import.meta.url).pathname
const glass = () => electron.evaluate(({ BrowserWindow }) => {
  const box = (globalThis.haligtreeGlass?.() ?? []).find(([id]) => { const w = BrowserWindow.fromId(id); return w && /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()) })
  return box ? box[1] : null
})
const look = (theme) => page.evaluate((t) => (localStorage.setItem('theme', t), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), theme)

/**
 * The box over a picture, on screen for a moment, both above every other window, and the screen captured only within
 * the picture's own window, which reaches well past the box on every side, so the blur behind the glass is the
 * picture's. Never anything else on the screen: the picture wears a magenta frame, and a capture whose four corners
 * are not that frame (the windows not up in time) is deleted unseen.
 */
async function capture(name, picture) {
  if (!shots) return
  const region = await electron.evaluate(async ({ BrowserWindow, screen }, picture) => {
    const box = BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
    const area = screen.getPrimaryDisplay().workArea
    globalThis.__wasAt = box.getBounds()
    globalThis.__wasTop = box.isAlwaysOnTop()
    box.setBounds({ ...globalThis.__wasAt, x: area.x + 260, y: area.y + 200 })
    const card = box.getBounds()
    const back = new BrowserWindow({ x: card.x - 220, y: card.y - 160, width: card.width + 440, height: card.height + 320, frame: false, show: false, focusable: false, hasShadow: false, enableLargerThanScreen: true })
    await back.loadURL(`data:text/html,<body style="margin:0;height:100vh;box-sizing:border-box;border:10px solid %23ff00ff;background:url('file://${picture}') center/cover"></body>`)
    globalThis.__back = back
    // On whichever Space is in front, a full-screen app's too.
    for (const one of [back, box]) one.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    back.setAlwaysOnTop(true, 'screen-saver', 1)
    box.setAlwaysOnTop(true, 'screen-saver', 2)
    // Kept out of screen captures by default ("Show in screen recordings"): let in for this one, put back after.
    box.setContentProtection(false)
    back.showInactive()
    box.showInactive()
    box.moveTop()
    return { ...back.getBounds(), id: back.getMediaSourceId().split(':')[1] }
  }, picture)
  await wait(1200)
  const file = join(shots, `${name}.png`)
  try {
    execFileSync('screencapture', ['-x', `-R${region.x},${region.y},${region.width},${region.height}`, file])
    const framed = await electron.evaluate(({ nativeImage }, file) => {
      const image = nativeImage.createFromPath(file)
      const { width, height } = image.getSize()
      const bits = image.toBitmap()
      const at = (x, y) => { const i = (y * width + x) * 4; return [bits[i + 2], bits[i + 1], bits[i]] }
      const magenta = ([r, g, b]) => r > 200 && g < 60 && b > 200
      return [at(3, 3), at(width - 4, 3), at(3, height - 4), at(width - 4, height - 4)].every(magenta)
    }, file)
    if (!framed) { unlinkSync(file); console.log(`capture ${name}: not framed, deleted unseen`) }
  } catch (error) { console.log('capture failed', error.message); try { unlinkSync(file) } catch {} }
  await electron.evaluate(({ BrowserWindow }) => {
    globalThis.__back?.destroy()
    const box = BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
    box.setAlwaysOnTop(!!globalThis.__wasTop)
    box.setContentProtection(true)
    box.setVisibleOnAllWorkspaces(false)
    if (globalThis.__wasAt) box.setBounds(globalThis.__wasAt)
  })
}

try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  await page.evaluate(() => window.api.showPrompt()); await wait(900)
  await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(600)

  for (const theme of ['dark', 'paper']) {
    await look(theme); await wait(900)
    const pill = await glass()
    const on = await page.evaluate(() => ({ glass: document.documentElement.hasAttribute('data-glass'), card: getComputedStyle(document.querySelector('.app-container')).backgroundColor, controls: document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button').length }))
    check(`${theme}: the pill and each round control stand on glass, nothing else`, !!pill && pill.shapes.length === on.controls + 1 && on.glass, JSON.stringify({ pill, on }))
    check(`${theme}: the glass is ${theme === 'dark' ? 'dark' : 'light'}, as the theme`, !!pill && pill.dark === (theme === 'dark'))
    check(`${theme}: the card lets the glass through (its fill not opaque)`, /\/ 0\.[0-9]|rgba\(.*, 0\.[0-9]+\)|oklab\(.* \/ 0\.[0-9]+\)/.test(on.card), on.card)
    await capture(`glass-pill-${theme}-light-wallpaper`, ROOT + 'dunes.webp')
    await capture(`glass-pill-${theme}-dark-wallpaper`, ROOT + 'approaching-thunder-storm.webp')
    // Grown: the card's shape follows it.
    await page.click(EDITOR); await page.keyboard.type('The world is on fire'); await page.keyboard.press('Enter'); await page.keyboard.type('no one can save me but you'); await wait(1000)
    const grown = await glass()
    const card = await page.evaluate(() => { const r = document.querySelector('.app-container').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n)) })
    check(`${theme}: grown, the card's glass is the card's own size`, !!grown && grown.shapes.some((s) => Math.abs(s[2] - card[2]) <= 1 && Math.abs(s[3] - card[3]) <= 1), JSON.stringify({ grown: grown?.shapes, card }))
    await capture(`glass-box-${theme}-light-wallpaper`, ROOT + 'dunes.webp')
    await capture(`glass-box-${theme}-dark-wallpaper`, ROOT + 'approaching-thunder-storm.webp')
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(700)
  }

  // Reduce Transparency: no glass, and every surface opaque.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] })
  await wait(700)
  const solid = await glass()
  const opaque = await page.evaluate(() => ({ glass: document.documentElement.hasAttribute('data-glass'), card: getComputedStyle(document.querySelector('.app-container')).backgroundColor }))
  check('Reduce Transparency: the glass is taken away', !!solid && solid.shapes.length === 0 && !opaque.glass, JSON.stringify({ solid, opaque }))
  check('…and the card is opaque', !/\/ 0\.[0-9]|, 0\.[0-9]+\)/.test(opaque.card), opaque.card)
  await cdp.send('Emulation.setEmulatedMedia', { features: [] })
  await wait(700)
  check('Reduce Transparency off again: the glass comes back', ((await glass())?.shapes.length ?? 0) > 0)
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
