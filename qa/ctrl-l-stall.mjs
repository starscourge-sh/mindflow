// ⌃L after another list in the one-line pill (the user's "after ctrl+l"): / or # opened and closed, then ⌃L, the frames
// the page draws in the 900ms after and whether the type list shows, light and dark, on screen. The "stall" once seen
// here was a probe pressing ⌘. (window.api.showPrompt(), a toggle) on a box that was up and in front: on screen that
// puts it away, and a hidden window draws nothing. Each way in is checked to have the box up with the keys first.
//   HALIGTREE_QA_ONSCREEN=1 QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/ctrl-l-stall.mjs
import { execFileSync } from 'child_process'
import { mkdirSync } from 'fs'
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
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'

/** Frames the page draws in `ms` after `act`. */
const frames = async (act, ms = 900) => {
  await page.evaluate((ms) => {
    window.__n = 0
    const t0 = performance.now()
    const tick = () => { window.__n++; if (performance.now() - t0 < ms) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }, ms)
  await act()
  await wait(ms + 100)
  return page.evaluate(() => window.__n)
}
const boxUp = () => electron.evaluate(({ BrowserWindow }) => {
  const box = BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
  return { visible: box.isVisible(), focused: box.isFocused() }
})
const kindList = () => page.evaluate(() => [...document.querySelectorAll('[role=menu], [data-slot=popover-content]')].some((el) => el.getBoundingClientRect().width > 4 && Number(getComputedStyle(el).opacity) > 0.5))
async function capture(name) {
  if (!shots || !process.env.HALIGTREE_QA_ONSCREEN) return
  const id = await electron.evaluate(({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
    box.setContentProtection(false)
    return box.getMediaSourceId().split(':')[1]
  })
  await wait(200)
  try { execFileSync('screencapture', ['-x', '-o', `-l${id}`, join(shots, `${name}.png`)]) } catch (error) { console.log('capture failed', error.message) }
}

try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  for (const look of ['dark', 'light']) {
    await c.look(look)
    await page.evaluate(() => window.api.showPrompt()); await wait(1200)
    await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(400)
    // Three ways to the second list: straight on, as a person types; the box brought up again while it is up and
    // has the keys (⌘. puts it away then, so it is brought back with a second ⌘.); and brought up again while up
    // with the main window holding the keys (main's up-again path: it takes the keys back).
    for (const way of ['typed', 'twice', 'from-main']) for (const first of ['/', '#']) {
      const name = `${way}-${first === '/' ? 'slash' : 'tag'}`
      await page.click(EDITOR).catch(() => {})
      await page.keyboard.press('End')
      await page.keyboard.type(first); await wait(900)
      await page.keyboard.press('Escape'); await page.keyboard.press('Backspace'); await wait(600)
      if (way === 'twice') {
        await page.evaluate(() => window.api.showPrompt()); await wait(500)
        check(`${look} ${name}: ⌘. with the box up and in front puts it away`, !(await boxUp()).visible)
        await page.evaluate(() => window.api.showPrompt()); await wait(500)
      }
      if (way === 'from-main') {
        await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => /view=home/.test(w.webContents.getURL()))?.focus()); await wait(300)
        check(`${look} ${name}: the main window has the keys, the box still up`, (await boxUp()).visible && !(await boxUp()).focused)
        await page.evaluate(() => window.api.showPrompt()); await wait(500)
      }
      const up = await boxUp()
      check(`${look} ${name}: the box is up with the keys before ⌃L`, up.visible && up.focused, JSON.stringify(up))
      await page.keyboard.press('End')
      const n = await frames(() => page.keyboard.press('Control+l'))
      const shown = await kindList()
      await capture(`ctrl-l-${name}-${look}`)
      check(`${look} ${name}: ⌃L draws at least 40 frames in 900ms (${n})`, n >= 40)
      check(`${look} ${name}: the type list shows`, shown)
      // Every row whole, the last one too, in the room the pill keeps under it (none faded and cut at the foot).
      const rows = await page.evaluate(() => {
        const list = document.querySelector('[cmdk-list]')
        if (!list) return null
        const box = list.getBoundingClientRect()
        const all = [...list.querySelectorAll('[cmdk-item]')]
        return { all: all.length, whole: all.filter((one) => { const r = one.getBoundingClientRect(); return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 && r.bottom <= innerHeight }).length }
      })
      check(`${look} ${name}: every row of the type list shows whole (${rows?.whole} of ${rows?.all})`, !!rows && rows.all > 0 && rows.whole === rows.all)
      await page.keyboard.press('Escape'); await wait(500)
    }
    await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  }
} finally {
  await c.close()
}
done()
