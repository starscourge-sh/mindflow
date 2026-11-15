// Quick capture goes as ⌘↵ keeps the note: its leave played and gone, never waiting for the save and what follows it
// (the user, 15 Nov 2026: "why is there a delay in the prompt closing right after cmd+enter. it says on screen for another
// 3 seconds"; on a built app it stayed 0.3 to 1 s, median 439 ms, while main's save took under 90 ms). Five notes kept in a
// row on a copy of the main book: each box gone within 350 ms of ⌘↵ (its 180 ms leave, then hidden), every note kept with
// its words, and the box opened again at once comes up empty and ready, the last save never clearing what is typed next.
//   QA_DATA=<copy of the main book> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-goes-at-once.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, seeded: false })
const { page, electron, h } = c
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const shown = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))?.isVisible() ?? false)
const kept = async (words) => (await page.evaluate(() => window.api.captures.list())).some((one) => (one.label ?? '').includes(words))
const open = async () => {
  await h.evaluate(() => window.api.showPrompt())
  for (let k = 0; k < 60 && !(await shown()); k++) await page.waitForTimeout(50)
  await page.waitForTimeout(600)
}
try {
  const times = []
  const stamp = Date.now().toString(36)
  for (let i = 1; i <= 5; i++) {
    await open()
    await page.click(EDITOR)
    await page.keyboard.type(`Kept at once ${stamp} number ${i}`)
    await page.waitForTimeout(500)
    const t0 = Date.now()
    await page.keyboard.press('Meta+Enter')
    let gone = -1
    for (let k = 0; k < 500; k++) { if (!(await shown())) { gone = Date.now() - t0; break } await page.waitForTimeout(10) }
    times.push(gone)
    // The next one at once, while this save may still be finishing: it must come up empty and keep what is typed in it.
    if (i === 3) {
      await open()
      const empty = await page.evaluate((sel) => (document.querySelector(sel)?.textContent ?? '').trim() === '', EDITOR)
      await page.click(EDITOR)
      await page.keyboard.type(`Typed straight after ${stamp}`)
      await page.waitForTimeout(1500)
      const still = await page.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', EDITOR)
      check('opened again at once: the box is empty and ready', empty)
      check('and what is typed in it next is never cleared by the save before', still.includes(`Typed straight after ${stamp}`), still.slice(0, 80))
      await page.keyboard.press('Meta+Enter')
      for (let k = 0; k < 100 && (await shown()); k++) await page.waitForTimeout(10)
    }
    await page.waitForTimeout(700)
  }
  const sorted = [...times].sort((a, b) => a - b)
  check(`each box goes within 350 ms of ⌘↵ (${times.join(', ')} ms)`, times.every((one) => one >= 0 && one <= 350), `median ${sorted[2]} ms`)
  await page.waitForTimeout(1500)
  const all = await Promise.all([1, 2, 3, 4, 5].map((i) => kept(`Kept at once ${stamp} number ${i}`)))
  check('every note is kept, with its words', all.every(Boolean), all.map((one, i) => `${i + 1}:${one}`).join(' '))
  check('and the one typed straight after too', await kept(`Typed straight after ${stamp}`))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
