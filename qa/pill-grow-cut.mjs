// The one-line pill growing into the box never shows the card cut off: not by the window (the card's foot past the
// window's), not by the card (the writing's last line past the card's foot, the user's "cutoff second line"). On
// screen, every frame (requestAnimationFrame) for 900ms after ↩, after ⇧↩, and after typing words that wrap past the
// line, light and dark. Also how long the card takes to be tall enough for its writing, from the key.
// The user, 4 Nov, typing "hey jude dont" and ↩: "still takes too long to expand, i should not notice the cutoff second line".
//   HALIGTREE_QA_ONSCREEN=1 QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pill-grow-cut.mjs
//   QA_SHOTS=<folder> also saves a picture of the page every frame of the first 300ms (read them by eye).
import { execFile } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, electron } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'

/** Every frame for `ms` after `act`: [ms since the key, card foot, window height, writing's foot, pill]. */
const film = async (act, name, ms = 900) => {
  await page.evaluate((ms) => {
    window.__cut = []
    const t0 = performance.now()
    window.__t0 = t0
    const tick = () => {
      const card = document.querySelector('.app-container')?.getBoundingClientRect()
      const doc = document.querySelector('.app-container .ProseMirror')
      const last = doc?.lastElementChild?.getBoundingClientRect()
      // Where the writing is seen to: its scroller's foot, if that is above the card's own.
      const scroller = doc?.closest('.haligtree-editor-content')?.getBoundingClientRect()
      window.__cut.push([Math.round(performance.now() - t0), card ? Math.round(card.bottom) : 0, innerHeight, last ? Math.round(last.bottom) : 0, !!document.querySelector('.app-container[data-pill]'), scroller ? Math.round(scroller.bottom) : 0, doc?.textContent.length ?? 0, Math.round(document.querySelector('.app-container')?.getBoundingClientRect().width ?? 0), window.api.room.pill ?? 0])
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms)
  // Pictures of the window itself as the Mac shows it (by its id), not the page's own: the window's edge is what cuts.
  const id = shots && await electron.evaluate(({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
    box.setContentProtection(false)
    return box.getMediaSourceId().split(':')[1]
  })
  const t0 = Date.now()
  // Each picture taken in its own process, every 20ms, while the keys go in: the Mac takes each in about 100ms.
  const taking = []
  const timer = shots && setInterval(() => {
    const at = Date.now() - t0
    if (at < 400) taking.push(new Promise((done) => execFile('screencapture', ['-x', '-o', `-l${id}`, join(shots, `${name}-${String(at).padStart(3, '0')}ms.png`)], done)))
  }, 20)
  await act()
  await wait(420)
  if (timer) clearInterval(timer)
  await Promise.all(taking)
  await wait(Math.max(0, ms + 100 - (Date.now() - t0)))
  return page.evaluate(() => window.__cut)
}

try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  for (const look of ['dark', 'light']) {
    await c.look(look)
    for (const way of ['enter', 'shift-enter', 'wrap']) {
      await page.evaluate(() => window.api.revealPrompt()); await wait(1000)
      await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(1200)
      await page.keyboard.type(way === 'wrap' ? 'hey jude dont make it bad, take a sad song' : 'hey jude dont')
      await wait(600)
      const name = `${look}-${way}`
      const frames = await film(async () => {
        if (way === 'enter') await page.keyboard.press('Enter')
        else if (way === 'shift-enter') await page.keyboard.press('Shift+Enter')
        else await page.keyboard.type(' and make it better, remember')
      }, name)
      if (shots) writeFileSync(join(shots, `${name}.json`), JSON.stringify(frames))
      // Cut by the window: the card's foot past the window's. Cut by the card: the writing's last line past where it is seen.
      const byWindow = frames.filter(([, foot, high]) => foot > high + 0.5)
      const byCard = frames.filter(([, foot, , last, , seen]) => last > Math.min(foot, seen || foot) + 0.5)
      const cut = (f) => byWindow.includes(f) || byCard.includes(f)
      const grown = frames.find((f, i) => !frames.slice(i).some(cut))
      check(`${look} ${way}: no frame has the card past the window's foot (${byWindow.length} of ${frames.length})`, !byWindow.length, byWindow.slice(0, 4).map((f) => `${f[0]}ms card ${f[1]} window ${f[2]}`).join(', '))
      check(`${look} ${way}: no frame has the writing cut off by the card (${byCard.length} of ${frames.length})`, !byCard.length, byCard.slice(0, 4).map((f) => `${f[0]}ms line ${f[3]} card ${f[1]} seen ${f[5]}`).join(', '))
      console.log(`${look} ${way}: whole from ${grown ? grown[0] : '?'}ms; first frames ${JSON.stringify(frames.slice(0, 5))}`)
      await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(1200)
    }
    await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  }
} finally {
  await c.close()
}
done()
