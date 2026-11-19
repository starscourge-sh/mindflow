// Every overlay opened from quick capture's own window, in the one-line pill and in the grown box, dark and light:
// / # @, ⌃L and a click on the kind chip, ⌘K, ⌃K, ⌘/ and the gear's menu. Each one either opens in the main window
// (nothing of it drawn in the capture window), or sits inside the capture window whole, the kind menu attached to
// its chip; and the blur under the card is where the card is, never a shape left where the card was (the user's
// 4f19f8eb: the card's top see-through, ghost copies of the pill lower down).
// With HALIGTREE_QA_ONSCREEN=1 it also films the pill growing into the box and folding back, every frame: the round
// controls beside the pill, in a row above the box at its right edge, gliding between (note 57aa1710).
// Pictures of the capture window itself, by its window id, go to QA_SHOTS (HALIGTREE_QA_ONSCREEN=1 to take them).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/capture-overlays.mjs
import { execFileSync } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
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
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
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
/**
 * Quick capture on Spotlight's material (10 Nov): the blur is under the card, and every other shape sits on a part
 * drawn now (a round control, an open menu or list, the hint), within 2px; never one left where the card was.
 */
const glassTrue = (s, shapes) => {
  const near = (a, b) => a.every((n, i) => Math.abs(n - b[i]) <= 2)
  const parts = [s.card, ...s.controls, ...s.pops.map((one) => one.box)].filter(Boolean)
  const cardOn = !!s.card && shapes.some((g) => near(g.slice(0, 4), s.card))
  const stray = shapes.filter((g) => !parts.some((p) => near(g.slice(0, 4), p)))
  // Left over: the hint, or a menu's own panel inside its role=menu wrapper: in the window, and never a copy of the card.
  return { ok: cardOn && stray.every((g) => g[1] >= 0 && g[1] + g[3] <= s.size[1] + 1 && !(s.card && Math.abs(g[2] - s.card[2]) <= 2 && Math.abs(g[3] - s.card[3]) <= 2)), stray }
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

/** The round controls' row through a change, every frame (16ms), with the card: [ms, row, card, pill]. */
const film = async (act, ms = 900) => {
  await page.evaluate(() => {
    window.__film = []
    const t0 = performance.now()
    // The moment the new line is made: the key that makes it (⇧↩) reaching the page, before any frame shows it.
    window.__line = null
    window.__t0 = t0
    // Once in the page's life: each film starts its own clock (__t0) and clears __line.
    if (!window.__lineHeard) addEventListener('keydown', (event) => { if (event.key === 'Enter' && window.__line === null) window.__line = Math.round(performance.now() - window.__t0) }, true)
    window.__lineHeard = true
    const box = (el) => { const r = el?.getBoundingClientRect(); return r ? [r.left, r.top, r.right, r.bottom].map((n) => Math.round(n)) : null }
    const tick = () => {
      window.__film.push([Math.round(performance.now() - t0), 'controlsAbove' in document.documentElement.dataset, box(document.querySelector('.mf-top')), box(document.querySelector('.app-container')), !!document.querySelector('.app-container[data-pill]'), [...document.querySelectorAll('.mf-top [data-aside] > *, .mf-top .mf-pill button')].filter((el) => el.offsetWidth > 0).map(box), (() => { const one = document.querySelector('main[data-zen-row] > *'); return one && one.getBoundingClientRect().height > 0 ? Number(getComputedStyle(one).opacity) : 0 })()])
      if (performance.now() - t0 < 1400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const pictures = []
  const t0 = Date.now()
  await act()
  while (Date.now() - t0 < ms) { if (shots) pictures.push(await page.screenshot()); else await wait(16) }
  await wait(Math.max(0, 1450 - (Date.now() - t0)))
  return { frames: await page.evaluate(() => window.__film), line: await page.evaluate(() => window.__line), pictures }
}
/** Each control's largest step from one frame to the next, against the whole way it goes (`trip`), and its step in the frame the shape changed (the whole
 * way, the row going with the card); where the row ends against the card. */
// A frame the page was too busy to draw (the fold's render) makes the next step longer: up to 55% of the way, never
// all of it at once.
const read = ({ frames }) => {
  let step = 0
  let start = 0
  const moved = (a, b) => Math.max(...a.map((one, i) => (b[i] ? Math.max(Math.abs(one[0] - b[i][0]), Math.abs(one[1] - b[i][1])) : 0)))
  for (let i = 1; i < frames.length; i++) {
    const [a, b] = [frames[i - 1][5], frames[i][5]]
    if (!a?.length || !b?.length) continue
    const by = moved(a, b)
    step = Math.max(step, by)
    if (frames[i - 1][4] !== frames[i][4]) start = by
  }
  const [, above, row, card, pill] = frames.at(-1)
  const ends = [frames.find((f) => f[5]?.length)?.[5], frames.at(-1)[5]]
  const trip = ends[0] && ends[1] ? moved(ends[0], ends[1]) : 0
  return { step, start, trip, above, row, card, pill, count: frames.length }
}
async function growAndFold(look) {
  await page.evaluate(() => window.api.revealPrompt()); await wait(1200)
  await page.click(EDITOR); await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(500)
  await page.keyboard.type('One line')
  const grown = await film(async () => { await page.keyboard.press('Shift+Enter'); await page.keyboard.type('two') })
  const g = read(grown)
  // The block handle, placed while the pointer was over the pill's line, never left over the writing as it grows.
  const grip = await page.evaluate(() => { const h = document.querySelector('.tiptap-drag-handle')?.getBoundingClientRect(); const first = document.querySelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain) > *')?.getBoundingClientRect(); const seen = !!h && Number(getComputedStyle(document.querySelector('.tiptap-drag-handle')).opacity) > 0.05; return { seen, over: !!h && !!first && seen && h.right > first.left && h.bottom > first.top && h.top < first.bottom } })
  check(`${look} grow: the block handle is not left over the first line's words`, !grip.over, JSON.stringify(grip))
  // From the new line to the page drawn as the box (its first frame), and to the box drawn taller as main grows the
  // window round it (the window's own glide starts there, over a frame or two: the page asks main to grow it).
  const after = grown.frames.filter((f) => f[0] >= grown.line)
  const boxAt = after.find((f) => !f[4])?.[0]
  const tallerAt = after.find((f) => f[3] && f[3][3] - f[3][1] > 58)?.[0]
  console.log(`${look}: new line at ${grown.line}ms, first frame ${after[0]?.[0]}ms, drawn as the box at ${boxAt}ms, taller at ${tallerAt}ms`)
  check(`${look} grow: drawn as the box in the frame the new line appears, not as the pill (${boxAt - grown.line}ms)`, boxAt !== undefined && boxAt === after[0]?.[0], JSON.stringify({ line: grown.line, first: after[0]?.[0], boxAt }))
  // Main grows the window: a message to it and its first resize, up to four frames (578ms on the old build).
  check(`${look} grow: the box is growing within 67ms of the new line (${tallerAt - grown.line}ms)`, tallerAt !== undefined && tallerAt - grown.line <= 67, JSON.stringify({ line: grown.line, tallerAt }))
  check(`${look} grow: the box grew (not the pill any more)`, !g.pill, JSON.stringify(g))
  check(`${look} grow: the round controls sit in a row above the box, level with its right edge`, !!g.row && !!g.card && g.row[3] <= g.card[1] - 4 && Math.abs(g.row[2] - g.card[2]) <= 2, JSON.stringify(g))
  // A key's change, in one frame: the controls at their new place in the frame the card becomes the box, never trailing
  // it on a clock of their own (only ⌘\ moves them on a curve, with the card, lib/box-morph.ts).
  check(`${look} grow: they go there with the card, in the frame it becomes the box (${g.start}px in that frame, of ${g.trip}px)`, g.trip > 0 && Math.abs(g.start - g.trip) <= 2, JSON.stringify(g))
  // The footer (the kind, Create) comes with the box, whole, in the frame it grows: never an empty card first.
  const footerLate = (frames) => frames.filter((f) => !f[4] && f[6] < 0.95).map((f) => `${f[0]}ms ${f[6]}`)
  const late = footerLate(grown.frames)
  check(`${look} grow: the footer shows whole in every frame of the box (${late.length} frames without it)`, !late.length, late.slice(0, 6).join(', '))
  const folded = await film(async () => { await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await page.keyboard.type('One line') }, 1400)
  const f = read(folded)
  check(`${look} fold: back to the pill`, f.pill, JSON.stringify(f))
  check(`${look} fold: the round controls are beside the pill again, at its height`, !!f.row && !!f.card && f.row[0] >= f.card[2] + 4 && Math.abs(f.row[1] - f.card[1]) <= 2, JSON.stringify(f))
  check(`${look} fold: they go back with the card, in the frame it folds (${f.start}px in that frame, of ${f.trip}px)`, f.trip > 0 && Math.abs(f.start - f.trip) <= 2, JSON.stringify(f))
  if (shots) {
    grown.pictures.forEach((png, i) => writeFileSync(join(shots, `grow-${look}-${String(i).padStart(2, '0')}.png`), png))
    folded.pictures.forEach((png, i) => writeFileSync(join(shots, `fold-${look}-${String(i).padStart(2, '0')}.png`), png))
    writeFileSync(join(shots, `grow-fold-${look}.json`), JSON.stringify({ grown: grown.frames, folded: folded.frames }))
  }
  // The side panel opened from the pill: the box grows with its footer whole, in the same way.
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace'); await wait(1400)
  const paneled = await film(async () => { await page.keyboard.press('Meta+Backslash') }, 1400)
  const pLate = paneled.frames.filter((f) => !f[4] && f[6] < 0.95).map((f) => `${f[0]}ms ${f[6]}`)
  const pBox = paneled.frames.find((f) => !f[4])
  check(`${look} side panel: the box grows with it, its footer whole in every frame (${pLate.length} without)`, !!pBox && !pLate.length, pBox ? pLate.slice(0, 6).join(', ') : 'never grew')
  if (shots) paneled.pictures.forEach((png, i) => writeFileSync(join(shots, `panel-${look}-${String(i).padStart(2, '0')}.png`), png))
  await page.keyboard.press('Meta+Backslash'); await wait(800)
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
}

try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  for (const look of ['dark', 'light']) {
    await c.look(look)
    // On screen only: parked off screen at its edge, the window has no room beside the pill, so its controls sit above it.
    if (process.env.HALIGTREE_QA_ONSCREEN) await growAndFold(look)
    if (process.env.QA_GROW_ONLY) continue
    for (const shape of ['pill', 'grown']) {
      await page.evaluate(() => window.api.revealPrompt()); await wait(1200)
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
        await page.evaluate(() => window.api.revealPrompt()); await wait(500)
      }
      await page.evaluate(() => window.api.hidePrompt()); await wait(500)
    }
  }
} finally {
  await c.close()
}
done()
