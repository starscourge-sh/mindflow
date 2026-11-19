// Quick capture and the stickies on real glass, Raycast's way: the Mac's blur of what is behind under the card, its
// round controls and its hint (or a sticky's card), and nowhere else (the clear room round them stays clear), dark or
// light as the theme; Reduce Transparency takes the glass away and every surface is opaque again.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/glass.mjs
// With a folder for pictures it captures the box's and the stickies' own windows by id (HALIGTREE_QA_ONSCREEN=1, as
// they are kept out of sight otherwise): HALIGTREE_QA_ONSCREEN=1 ... node qa/glass.mjs shots-dir
import { execFileSync } from 'child_process'
import { mkdirSync } from 'fs'
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
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const glass = () => electron.evaluate(({ BrowserWindow }) => {
  const box = (globalThis.haligtreeGlass?.() ?? []).find(([id]) => { const w = BrowserWindow.fromId(id); return w && /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()) })
  return box ? box[1] : null
})
const look = (theme) => page.evaluate((t) => (localStorage.setItem('theme', t), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), theme)

/**
 * A picture of the box's own window, by its window id (screencapture -l): never a region of the screen, so nothing
 * else on it is ever taken. The box is let into captures for this one ("Show in screen recordings" is off by
 * default) and kept out again after.
 */
async function capture(name) {
  if (!shots) return
  const id = await electron.evaluate(({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
    box.setContentProtection(false)
    return box.getMediaSourceId().split(':')[1]
  })
  await wait(400)
  try { execFileSync('screencapture', ['-x', '-o', `-l${id}`, join(shots, `${name}.png`)]) } catch (error) { console.log('capture failed', error.message) }
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))?.setContentProtection(true))
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
    await capture(`glass-pill-${theme}`)
    // Grown: the card's shape follows it.
    await page.click(EDITOR); await page.keyboard.type('The world is on fire'); await page.keyboard.press('Enter'); await page.keyboard.type('no one can save me but you'); await wait(1000)
    const grown = await glass()
    const card = await page.evaluate(() => { const r = document.querySelector('.app-container').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n)) })
    check(`${theme}: grown, the card's glass is the card's own size`, !!grown && grown.shapes.some((s) => Math.abs(s[2] - card[2]) <= 1 && Math.abs(s[3] - card[3]) <= 1), JSON.stringify({ grown: grown?.shapes, card }))
    await capture(`glass-box-${theme}`)
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
  // The stickies' Glass material: the same glass under each card, cut to its rounded shape, and none with Reduce Transparency.
  await v('settings:set', { stickiesGlass: true, stickiesFrosted: true }); await wait(3500)
  const stickyWins = c.electron.windows().filter((w) => /view=sticky/.test(w.url()) && /glass=1/.test(w.url()))
  check('as glass, the stickies are made again on glass', stickyWins.length >= 1, String(stickyWins.length))
  const stickyGlass = () => electron.evaluate(({ BrowserWindow }) => (globalThis.haligtreeGlass?.() ?? []).map(([id, one]) => { const w = BrowserWindow.fromId(id); return w && /view=sticky/.test(w.webContents.getURL()) ? { url: w.webContents.getURL().replace(/^.*\?/, ''), size: w.getContentSize(), ...one } : null }).filter(Boolean))
  for (const theme of ['dark', 'paper']) {
    for (const w of stickyWins) await w.evaluate((t) => (localStorage.setItem('theme', t), window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }))), theme)
    await wait(1200)
    const seen = await stickyGlass()
    const whole = seen.filter((one) => one.shapes.length === 1 && Math.abs(one.shapes[0][2] - one.size[0]) <= 2 && Math.abs(one.shapes[0][3] - one.size[1]) <= 2 && one.shapes[0][4] >= 8)
    check(`${theme}: each glass sticky stands on glass cut to its card (its whole window, rounded corners)`, seen.length >= stickyWins.length && whole.length === seen.length, JSON.stringify(seen))
    check(`${theme}: the stickies' glass is ${theme === 'dark' ? 'dark' : 'light'}, as the theme`, seen.length > 0 && seen.every((one) => one.dark === (theme === 'dark')))
    const wash = await stickyWins[0].evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mf-glass-wash').trim())
    check(`${theme}: the paper is a wash over the glass, not solid`, /^(62|74)%$/.test(wash), wash)
  }
  const sticky = stickyWins[0]
  const stickyCdp = await sticky.context().newCDPSession(sticky)
  await stickyCdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] })
  await wait(700)
  const flat = (await stickyGlass()).find((one) => sticky.url().includes(one.url))
  const flatWash = await sticky.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--mf-glass-wash').trim())
  check('a sticky with Reduce Transparency: no glass, the whole paper', !!flat && flat.shapes.length === 0 && flatWash === '100%', JSON.stringify({ flat, flatWash }))
  await stickyCdp.send('Emulation.setEmulatedMedia', { features: [] })
  if (shots) {
    for (const [n, w] of stickyWins.slice(0, 2).entries()) {
      const id = await electron.evaluate(({ BrowserWindow }, url) => { const one = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL() === url); one.setContentProtection(false); return one.getMediaSourceId().split(':')[1] }, w.url())
      await wait(300)
      // Only this window, by its own id: never anything else on the screen.
      try { execFileSync('screencapture', ['-x', '-o', `-l${id}`, join(shots, `glass-sticky-${n}.png`)]) } catch (error) { console.log('capture failed', error.message) }
      await electron.evaluate(({ BrowserWindow }, url) => BrowserWindow.getAllWindows().find((x) => x.webContents.getURL() === url)?.setContentProtection(true), w.url())
    }
  }
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
