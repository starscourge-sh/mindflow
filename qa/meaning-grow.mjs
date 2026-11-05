// A Word's meaning in the one-line pill grows the pill into the box in ONE step, in the frame the meaning shows: never
// the pill, then partway, then the full height. On screen, every frame (requestAnimationFrame) from the word typed until
// the box rests, light and dark, with a picture of the page every 50ms (QA_SHOTS=<folder>), read by eye. The windows
// stay parked off the screen: pictures come from the page itself, never the screen.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/meaning-grow.mjs
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_MAC_DICT = 'on'

const shots = process.env.QA_SHOTS ?? process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, electron } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'

/** Every frame for `ms` after `act`: [ms, card height, card foot, window height, meaning shown, meaning foot, pill]. */
const film = async (act, name, ms = 2600) => {
  await page.evaluate((ms) => {
    window.__f = []
    const t0 = performance.now()
    const tick = () => {
      const card = document.querySelector('.app-container')?.getBoundingClientRect()
      const meaning = document.querySelector('[data-define="ghost"], [data-define="kept"]')
      const seen = !!meaning && getComputedStyle(meaning).visibility !== 'hidden'
      const foot = meaning?.querySelector('[data-meaning]')?.getBoundingClientRect().bottom ?? 0
      window.__f.push([Math.round(performance.now() - t0), Math.round(card?.height ?? 0), Math.round(card?.bottom ?? 0), innerHeight, seen, Math.round(foot), !!document.querySelector('.app-container[data-pill]'), Math.round(card?.width ?? 0), Math.round(meaning?.getBoundingClientRect().height ?? 0), Math.round(meaning?.previousElementSibling?.getBoundingClientRect().height ?? 0), document.documentElement.hasAttribute('data-card-held')])
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms)
  const t0 = Date.now()
  // A picture of the page every 50ms, taken one after another while the keys go in.
  const taking = (async () => {
    while (shots && Date.now() - t0 < ms) {
      const at = Date.now() - t0
      // The window's own picture (webContents.capturePage): the page's screenshot waits for a frame and stalled while the window grew.
      const png = await electron.evaluate(async ({ BrowserWindow }) => {
        const box = BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
        return box ? (await box.webContents.capturePage()).toPNG().toString('base64') : null
      }).catch(() => null)
      if (png) writeFileSync(join(shots, `${name}-${String(at).padStart(4, '0')}ms.png`), Buffer.from(png, 'base64'))
      await new Promise((ok) => setTimeout(ok, Math.max(0, 50 - (Date.now() - t0 - at))))
    }
  })()
  await act()
  await wait(Math.max(0, ms + 100 - (Date.now() - t0)))
  await taking
  return page.evaluate(() => window.__f)
}

try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true, wordMeanings: 'one-word' })
  for (const look of ['light', 'dark']) {
    await c.look(look)
    for (const word of ['serendipity', 'run']) {
      await page.evaluate(() => window.api.revealPrompt()); await wait(1000)
      await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(1400)
      const name = `${look}-${word}`
      const frames = await film(() => page.keyboard.type(word, { delay: 30 }), name)
      if (shots) writeFileSync(join(shots, `${name}.json`), JSON.stringify(frames))
      const shown = frames.findIndex((f) => f[4])
      const last = frames.at(-1)
      // The card's heights from the frame it left the pill: each new height is a step.
      const from = frames.findIndex((f) => !f[6])
      const steps = []
      for (const f of from >= 0 ? frames.slice(from) : []) if (!steps.length || Math.abs(steps.at(-1) - f[1]) > 1) steps.push(f[1])
      const cut = frames.filter((f) => f[4] && (f[5] > f[2] + 0.5 || f[2] > f[3] + 0.5))
      check(`${look} ${word}: the meaning shows`, shown >= 0)
      check(`${look} ${word}: the pill grows in one step (${steps.length} height${steps.length === 1 ? '' : 's'} after the pill: ${steps.join(' → ')})`, steps.length === 1, frames.filter((f, i) => i > 0 && Math.abs(f[1] - frames[i - 1][1]) > 1).map((f) => `${f[0]}ms ${f[1]}`).join(', '))
      check(`${look} ${word}: at its full height in the frame the meaning shows`, shown >= 0 && Math.abs(frames[shown][1] - last[1]) <= 1 && (from < 0 || from >= shown), shown >= 0 ? `shown ${frames[shown][0]}ms at ${frames[shown][1]}, rests at ${last[1]}; left the pill at ${frames[from]?.[0]}ms` : '')
      check(`${look} ${word}: the meaning is never cut by the card or the window (${cut.length} frames)`, !cut.length, cut.slice(0, 3).map((f) => `${f[0]}ms meaning ${f[5]} card ${f[2]} window ${f[3]}`).join(', '))
      console.log(`${look} ${word}: ${steps.join(' → ')}; meaning at ${shown >= 0 ? frames[shown][0] : '?'}ms`)
      await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(1200)
    }
    await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  }
  check('no errors', c.errors.length === 0, c.errors.slice(0, 2).join(' | '))
} finally {
  await c.close()
}
done()
