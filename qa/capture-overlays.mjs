// Every overlay opened from quick capture's own window, in the one-line pill and in the grown box, dark and light:
// / # @, ⌃L and a click on the kind chip, ⌘K, ⌃K, ⌘/ and the gear's menu. Each one either opens in the main window
// (nothing of it drawn in the capture window), or sits inside the capture window whole, the kind menu attached to
// its chip; and the blur under the card is where the card is, never a shape left where the card was (the user's
// 4f19f8eb: the card's top see-through, ghost copies of the pill lower down).
// Pictures of the capture window itself, by its window id, go to QA_SHOTS (HALIGTREE_QA_ONSCREEN=1 to take them).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/capture-overlays.mjs
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
const { page, electron, h } = c
const wait = (ms) => page.waitForTimeout(ms)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line)'
const isBox = (url) => /index\.html/.test(url) && !/view=/.test(url)

/** The blur shapes main was last told for the capture window. */
const glass = () => electron.evaluate(({ BrowserWindow }) => {
  const one = (globalThis.haligtreeGlass?.() ?? []).find(([id]) => { const w = BrowserWindow.fromId(id); return w && /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()) })
  return one ? one[1].shapes : []
})
async function capture(name) {
  if (!shots || !process.env.HALIGTREE_QA_ONSCREEN) return
  const id = await electron.evaluate(({ BrowserWindow }) => {
    const box = BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))
    box.setContentProtection(false)
    return box.getMediaSourceId().split(':')[1]
  })
  await wait(300)
  try { execFileSync('screencapture', ['-x', '-o', `-l${id}`, join(shots, `${name}.png`)]) } catch (error) { console.log('capture failed', error.message) }
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => /index\.html/.test(w.webContents.getURL()) && !/view=/.test(w.webContents.getURL()))?.setContentProtection(true))
}

/** What the capture window shows: the card, its round controls, every overlay open in it, and the window's size. */
const state = () => page.evaluate(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((n) => Math.round(n)) }
  const card = document.querySelector('.app-container')
  const pops = [...document.querySelectorAll('[role=dialog], [role=alertdialog], [role=menu], [data-slot=popover-content], .tiptap-suggestion-popup, [cmdk-dialog], [data-slot=dialog-content]')]
    .filter((el) => el.getBoundingClientRect().width > 4 && getComputedStyle(el).visibility !== 'hidden' && Number(getComputedStyle(el).opacity) > 0.1)
    .map((el) => {
      const r = el.getBoundingClientRect()
      const list = el.querySelector('[cmdk-list]') ?? el
      const lr = list.getBoundingClientRect()
      const rows = [...el.querySelectorAll('[cmdk-item], [role=menuitem], [role=option]')].map((row) => row.getBoundingClientRect())
      // Rows the list shows only in part, with no way to scroll to the rest of them.
      const cut = rows.filter((row) => row.top < lr.bottom - 1 && row.bottom > lr.bottom + 1).length
      return { kind: el.getAttribute('role') ?? el.dataset.slot ?? el.className.slice(0, 30), box: box(el), cut, scrolls: list.scrollHeight > list.clientHeight + 1, inWindow: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 }
    })
  const controls = [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((el) => el.offsetWidth > 0).map(box)
  // The list hangs from what is in sight: the pill's kind mark in the one-line pill, the footer's chip in the grown box.
  const pill = !!document.querySelector('.app-container[data-pill]')
  const chip = document.querySelector(pill ? '[data-pill-kind]' : '[data-kind-chip]')
  return { card: card ? box(card) : null, controls, pops, chip: chip && chip.getBoundingClientRect().width > 0 ? box(chip) : null, size: [innerWidth, innerHeight], pill }
})
/** Every blur shape sits on a part drawn now (the card or a round control or the hint), within 2px. */
const glassTrue = (s, shapes) => {
  const near = (a, b) => a.every((n, i) => Math.abs(n - b[i]) <= 2)
  const parts = [s.card, ...s.controls].filter(Boolean)
  const stray = shapes.filter((g) => !parts.some((p) => near(g.slice(0, 4), p)))
  const cardOn = !!s.card && shapes.some((g) => near(g.slice(0, 4), s.card))
  // The hint is a part too; it may stand alone (a shape not on the card or a control, but in the window).
  return { ok: cardOn && stray.every((g) => g[1] >= 0 && g[1] + g[3] <= s.size[1] && g[3] < s.card[3] + 200 && !parts.some((p) => Math.abs(g[2] - p[2]) <= 2 && Math.abs(g[3] - p[3]) <= 2)), stray }
}
const home = () => h.evaluate(() => ({ palette: !!document.querySelector('[cmdk-dialog], [data-slot=dialog-content] [cmdk-root]'), sheet: !!document.querySelector('[data-shortcut-sheet], [role=dialog]') }))

const OVERLAYS = [
  { name: 'slash', open: async (shape) => { await page.keyboard.type(shape === 'grown' ? ' /' : '/') }, close: async (shape) => { await page.keyboard.press('Escape'); await page.keyboard.press('Backspace'); if (shape === 'grown') await page.keyboard.press('Backspace') } },
  { name: 'tag', open: async (shape) => { await page.keyboard.type(shape === 'grown' ? ' #' : '#') }, close: async (shape) => { await page.keyboard.press('Escape'); await page.keyboard.press('Backspace'); if (shape === 'grown') await page.keyboard.press('Backspace') } },
  { name: 'mention', open: async (shape) => { await page.keyboard.type(shape === 'grown' ? ' @' : '@') }, close: async (shape) => { await page.keyboard.press('Escape'); await page.keyboard.press('Backspace'); if (shape === 'grown') await page.keyboard.press('Backspace') } },
  { name: 'ctrl-l', open: async () => { await page.keyboard.press('Control+l') }, close: async () => { await page.keyboard.press('Escape') }, kindMenu: true },
  { name: 'kind-click', grownOnly: true, open: async () => { await page.click('[data-kind-chip]').catch(() => {}) }, close: async () => { await page.keyboard.press('Escape') }, kindMenu: true },
  { name: 'cmd-k', open: async () => { await page.keyboard.press('Meta+k') }, close: async () => { await page.keyboard.press('Escape'); await h.keyboard.press('Escape').catch(() => {}) }, big: true },
  // ⌃K in the writing is the Mac's "delete to the end of the line", nothing opened anywhere (⌘K is the box).
  { name: 'ctrl-k', open: async () => { await page.keyboard.type(' cut'); for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Control+k') }, close: async () => {}, deletes: true },
  { name: 'cmd-slash', open: async () => { await page.keyboard.press('Meta+/') }, close: async () => { await page.keyboard.press('Escape'); await h.keyboard.press('Escape').catch(() => {}) }, big: true }
]

try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  for (const look of ['dark', 'light']) {
    await c.look(look)
    for (const shape of ['pill', 'grown']) {
      await page.evaluate(() => window.api.showPrompt()); await wait(1200)
      await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(400)
      if (shape === 'grown') {
        await page.keyboard.type('Grown box'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('two lines'); await wait(900)
      }
      const rest = await state()
      const restGlass = await glass()
      check(`${look} ${shape}: at rest, the blur is under the card and its controls only`, glassTrue(rest, restGlass).ok, JSON.stringify({ card: rest.card, shapes: restGlass }))
      await capture(`${shape}-${look}-rest`)
      for (const one of OVERLAYS) {
        if (one.grownOnly && shape !== 'grown') continue
        await page.click(EDITOR).catch(() => {})
        if (shape === 'grown') await page.keyboard.press('Meta+ArrowDown')
        await page.keyboard.press('End')
        const words = await page.evaluate((sel) => document.querySelector(sel).textContent, EDITOR)
        await one.open(shape); await wait(shape === 'grown' ? 1400 : 900)
        const s = await state()
        const g = await glass()
        const inHome = await home()
        await capture(`${shape}-${look}-${one.name}`)
        const name = `${look} ${shape} ${one.name}`
        if (one.deletes) {
          const after = await page.evaluate((sel) => document.querySelector(sel).textContent, EDITOR)
          check(`${name}: deletes to the end of the line, and opens nothing in either window`, after === words && s.pops.length === 0 && !inHome.palette, JSON.stringify({ words, after, pops: s.pops, inHome }))
        } else if (one.big) {
          check(`${name}: opens in the main window, nothing of it in the capture window`, s.pops.length === 0 && (inHome.palette || inHome.sheet), JSON.stringify({ pops: s.pops, inHome }))
        } else {
          const pop = s.pops[0]
          check(`${name}: opens, whole inside the capture window`, !!pop && s.pops.every((p) => p.inWindow), JSON.stringify(s.pops))
          check(`${name}: no row cut off without a way to scroll to it`, !!pop && s.pops.every((p) => !p.cut || p.scrolls), JSON.stringify(s.pops))
          if (one.kindMenu) {
            check(`${name}: the kind mark it hangs from is in sight`, !!s.chip, JSON.stringify({ chip: s.chip }))
          }
          if (one.kindMenu && pop && s.chip) {
            const gap = pop.box[1] >= s.chip[1] + s.chip[3] ? pop.box[1] - (s.chip[1] + s.chip[3]) : s.chip[1] - (pop.box[1] + pop.box[3])
            check(`${name}: the kind menu hangs from its chip (${gap}px from it)`, gap >= 0 && gap <= 12, JSON.stringify({ chip: s.chip, pop: pop.box }))
          }
        }
        const true_ = glassTrue(s, g)
        check(`${name}: the blur is still under the card, nothing left where it was`, true_.ok, JSON.stringify({ card: s.card, size: s.size, stray: true_.stray }))
        await one.close(shape); await wait(600)
        await h.keyboard.press('Escape').catch(() => {})
        await page.evaluate(() => window.api.showPrompt()); await wait(500)
      }
      await page.evaluate(() => window.api.hidePrompt()); await wait(500)
    }
  }
} finally {
  await c.close()
}
done()
