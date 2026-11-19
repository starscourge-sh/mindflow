// A short toast in quick capture sits centred under the writing, panel open or shut; ⌘K in the box opens the main
// window's command box (e5ad3bb60), where "Next theme" says where it landed, centred in that window's own lane, with
// nothing typed landing in the box; a long toast rises above the box's footer; a theme picked by name brings no toast.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-toast-centre.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1100, height: 600 })
const { page, h, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
// A notice sent as the app sends any (ui.tsx listens for it in every window).
const say = (target, text) => target.evaluate((words) => window.dispatchEvent(new CustomEvent('haligtree:toast', { detail: { text: words, tone: 'info' } })), text)
// The box's notice against its footer's row: centred on it, and clear of Create.
const inBox = () => page.evaluate(() => {
  const t = document.querySelector('[role=status]'); const row = document.querySelector('[data-toast-up]')
  if (!t || !row) return null
  const a = t.getBoundingClientRect(), r = row.getBoundingClientRect()
  return { text: t.innerText.replace(/\s+/g, ' '), off: Math.round((a.left + a.right) / 2 - (r.left + r.right) / 2), create: Math.round(row.lastElementChild.getBoundingClientRect().left - a.right) }
})
try {
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700)
  for (const panel of [false, true]) {
    if (panel) { await page.keyboard.press('Meta+\\'); await page.waitForTimeout(600) }
    await say(page, 'Wearing Paper')
    await page.waitForTimeout(500)
    const at = await inBox()
    check(`${panel ? 'panel open' : 'panel shut'}: a short toast centred under the writing`, at && Math.abs(at.off) <= 2 && at.create > 0, JSON.stringify(at))
    await page.waitForTimeout(6000)
  }

  // ⌘K from the box: the main window's command box, never squeezed into the card. "Next theme" is typed there, as a
  // person's keys go to the window that came forward; its notice is said there, centred in that window's lane.
  const themeOf = (target) => target.evaluate(() => localStorage.getItem('theme'))
  const was = await themeOf(h)
  await page.click(EDITOR)
  await page.keyboard.press('Meta+k')
  const opened = await h.waitForSelector('[role="dialog"][aria-label="Search"]', { timeout: 5000 }).then(() => true).catch(() => false)
  check('⌘K in the box opens the main window’s command box', opened)
  await h.keyboard.type('next theme', { delay: 10 }); await h.waitForTimeout(300)
  await h.keyboard.press('Enter'); await h.waitForTimeout(700)
  const said = await h.evaluate(() => {
    const t = document.querySelector('[role=status]')
    if (!t) return null
    // The lane it stands in: the fixed strip along the window's foot, between the sidebar and the right edge.
    let lane = t.parentElement
    while (lane && getComputedStyle(lane).position !== 'fixed') lane = lane.parentElement
    if (!lane) return null
    const a = t.getBoundingClientRect(), r = lane.getBoundingClientRect()
    return { text: t.innerText.replace(/\s+/g, ' '), off: Math.round((a.left + a.right) / 2 - (r.left + r.right) / 2), lane: [Math.round(r.left), Math.round(r.right)] }
  })
  const now = await themeOf(h)
  check('“Next theme” there changes the theme', !!now && now !== was, `${was} → ${now}`)
  check('and says so in the main window, centred in its lane', said && /Wearing/.test(said.text) && Math.abs(said.off) <= 2, JSON.stringify(said))
  const box = await page.evaluate((sel) => document.querySelector(sel)?.innerText.trim() ?? null, EDITOR)
  check('nothing typed for it lands in the box', box === '', JSON.stringify(box))
  await h.waitForTimeout(6000)
  // Going to the main window put the box away (one window at a time, main's openHome): called up again.
  await h.keyboard.press('Escape').catch(() => {})
  await page.evaluate(() => window.api.showPrompt()); await page.waitForTimeout(700)

  // A long one: the welcome's "That waits until the welcome is done" is too long to pass Create centred.
  await c.electron.evaluate(({ BrowserWindow }) => { const box = BrowserWindow.getAllWindows().find((w) => w.isVisible() && w.getBounds().width >= 1000 && w.getBounds().height <= 700); box?.setSize(680, 600) })
  await page.waitForTimeout(600)
  // A style change no longer says anything (you can see it), so the long words are sent as the app sends any toast.
  await say(page, 'That waits until the welcome is done')
  await page.waitForTimeout(500)
  const long = await page.evaluate(() => {
    const t = document.querySelector('[role=status]'); const row = document.querySelector('footer') ?? document.querySelector('[data-toast-up]')
    if (!t) return null
    const a = t.getBoundingClientRect(), r = (document.querySelector('[data-toast-up]') ?? row).getBoundingClientRect()
    return { lines: Math.round(a.height), off: Math.round((a.left + a.right) / 2 - (r.left + r.right) / 2), above: Math.round(r.top - a.bottom) }
  })
  check('a long toast rises above the footer, centred, on one line', long && long.lines <= 40 && Math.abs(long.off) <= 2 && long.above >= 0, JSON.stringify(long))
  await page.waitForTimeout(6000)
  // "Change theme" from the box's ⌘K, picked from its list in the main window: no toast (you can see it).
  await page.click(EDITOR)
  await page.keyboard.press('Meta+k')
  await h.waitForSelector('[role="dialog"][aria-label="Search"]', { timeout: 5000 }).catch(() => {})
  await h.keyboard.type('change theme', { delay: 10 }); await h.waitForTimeout(300)
  await h.keyboard.press('Enter'); await h.waitForTimeout(700)
  await h.keyboard.press('ArrowDown'); await h.keyboard.press('Enter'); await h.waitForTimeout(800)
  const toast = await h.evaluate(() => document.querySelector('[role=status]')?.innerText ?? '')
  check('a theme picked from the list brings no toast', !/Wearing/.test(toast), toast)
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
