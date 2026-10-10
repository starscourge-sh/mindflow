// The preview cards: a sidebar row's page preview, and the `/` menu's block
// preview. Hovers every sidebar entry and every slash item and checks the card
// shows, fits the window, never covers what it is about, and swaps at once.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-preview/main/index.js MINDFLOW_QA_AWAY=1 SHOTS=<dir> node qa/previews.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: 1180, height: 780 })
const { h, page, go } = c
const fails = []
const fail = (what) => (fails.push(what), console.log('FAIL', what))
const inside = (r, w) => r.left >= 0 && r.top >= 0 && r.right <= w.width && r.bottom <= w.height
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** The card on screen now, with where it is and what it says. */
const card = (win, selector) => win.evaluate((sel) => {
  const el = document.querySelector(sel)
  if (!el) return null
  const box = (el.closest('[data-slot="tooltip-content"]') ?? el).getBoundingClientRect()
  return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, text: el.innerText.replace(/\s+/g, ' ').trim(), state: el.closest('[data-state]')?.dataset.state ?? null, opacity: getComputedStyle(el.closest('[data-slot="tooltip-content"]') ?? el).opacity }
}, selector)
const view = (win) => win.evaluate(() => ({ width: innerWidth, height: innerHeight }))

async function sidebar(label) {
  await go('home')
  // Every fold open, so every entry can be hovered.
  for (const name of ['Tasks', 'Saved', 'More', 'Types']) {
    const head = h.locator(`aside button[aria-expanded="false"]`, { hasText: new RegExp(`^\\s*${name}\\s*$`) })
    if (await head.count()) await head.first().click()
  }
  await h.waitForTimeout(600)
  const rows = await h.evaluate(() => [...document.querySelectorAll('aside button[data-side-row]:not([aria-expanded]):not([data-drag-open])')]
    .filter((b) => b.offsetParent && !b.closest('[data-side-heading]') && !b.querySelector('[data-tag-icon]') && b.getBoundingClientRect().height > 0)
    .map((b) => b.getAttribute('aria-label') || b.innerText.trim().split('\n')[0]))
  console.log(`${label}: ${rows.length} sidebar entries`)
  const win = await view(h)
  // Timed in the page, from the pointer reaching a row to its card being drawn, so a busy machine's lag in driving the mouse does not count.
  await h.evaluate(() => {
    window.__peek = { enter: 0, shown: 0 }
    addEventListener('pointerover', (e) => { if (e.target.closest?.('aside button[data-side-row]')) window.__peek.enter = performance.now() }, true)
    new MutationObserver(() => { const el = document.querySelector('[data-peek-card]'); if (el && el !== window.__peek.el) (window.__peek.el = el, window.__peek.shown = performance.now()) }).observe(document.body, { childList: true, subtree: true })
  })
  let first = true
  let previous = ''
  for (const name of rows) {
    const named = h.locator(`aside button[data-side-row][aria-label="${name}"]`)
    const row = (await named.count()) ? named.first() : h.locator('aside button[data-side-row]:not([aria-label])', { hasText: new RegExp(`^${name}`) }).first()
    if (!(await row.isVisible())) { fail(`${name}: not visible to hover`); continue }
    const before = await row.boundingBox()
    await row.scrollIntoViewIfNeeded()
    const r = await row.boundingBox()
    // Scrolled under a still pointer: the list moved, the hand did not, so the next card waits its delay again.
    if (Math.abs(before.y - r.y) > 1) (first = true, await h.waitForTimeout(1000))
    const started = Date.now()
    await h.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 4 })
    // The first one waits for the hover delay; after it, each swaps in at once.
    let seen = null
    for (let i = 0; i < (first ? 80 : 20); i++) {
      seen = await card(h, '[data-peek-card]')
      if (seen && seen.text !== previous) break
      await h.waitForTimeout(25)
    }
    const took = Math.round(await h.evaluate(() => window.__peek.shown - window.__peek.enter)) || Date.now() - started
    if (!seen || seen.text === previous) { fail(`${name}: no card`); continue }
    if (!first && seen.state !== 'instant-open') fail(`${name}: swapped with a fade (${seen.state})`)
    if (!first && took > 100) fail(`${name}: swap took ${took}ms`)
    if (!inside(seen, win)) fail(`${name}: card runs past the window ${JSON.stringify(seen)}`)
    const rowBox = { left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }
    if (overlap(seen, rowBox)) fail(`${name}: card covers its row`)
    if (!/^.+?:/.test(seen.text)) fail(`${name}: no lead line: ${seen.text.slice(0, 60)}`)
    console.log(`  ${name.padEnd(20)} ${first ? 'delayed' : `${took}ms`.padEnd(7)} ${seen.text.slice(0, 90)}`)
    previous = seen.text
    first = false
  }
  // Away and back to Gems for the picture.
  await h.mouse.move(700, 400)
  await h.waitForTimeout(700)
  const gems = h.locator('aside button[aria-label="Gems"]').first()
  await gems.scrollIntoViewIfNeeded()
  const g = await gems.boundingBox()
  await h.mouse.move(g.x + 20, g.y + g.height / 2, { steps: 3 })
  await h.waitForTimeout(900)
  if (!(await card(h, '[data-peek-card]'))) fail(`${label}: no Gems card for the picture`)
  await h.screenshot({ path: `${dir}/sidebar-gems-${label}.png` })

  // Carrying something: no card.
  await h.mouse.move(700, 400)
  await h.waitForTimeout(700)
  await h.evaluate(() => (document.documentElement.dataset.dragging = ''))
  const inbox = await h.locator('aside button[aria-label="Inbox"]').first().boundingBox()
  await h.mouse.move(inbox.x + 20, inbox.y + inbox.height / 2, { steps: 3 })
  await h.waitForTimeout(800)
  if (await card(h, '[data-peek-card]')) fail(`${label}: card shown while dragging`)
  await h.evaluate(() => delete document.documentElement.dataset.dragging)
  // A pointer at rest while the list scrolls under it: no card.
  await h.mouse.move(700, 400)
  await h.waitForTimeout(700)
}

async function slash(label, win, shot) {
  // A line to write in, on Today's page in the main window or the box.
  const editor = win.locator('.tiptap.ProseMirror.mindflow-editor:not(.is-line)').first()
  await editor.click()
  await win.keyboard.press('Meta+ArrowDown')
  await win.keyboard.press('Enter')
  await win.keyboard.type('/')
  await win.waitForSelector('.tiptap-slash-menu-list button', { timeout: 5000 })
  const titles = await win.evaluate(() => [...document.querySelectorAll('.tiptap-slash-menu-list button .tiptap-slash-menu-title')].map((t) => t.textContent))
  console.log(`${label}: ${titles.length} slash items`)
  const size = await view(win)
  // It shows on its own after a moment, for the first item.
  await win.waitForTimeout(600)
  let seen = await card(win, '[data-slash-peek]')
  if (!seen) fail(`${label}: no slash card after resting`)
  let previous = seen?.text ?? ''
  for (let i = 1; i < titles.length; i++) {
    await win.keyboard.press('ArrowDown')
    seen = await card(win, '[data-slash-peek]')
    const menu = await win.evaluate(() => { const r = document.querySelector('.tiptap-slash-menu').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } })
    if (!seen) { fail(`${titles[i]}: no card`); continue }
    if (seen.text === previous) fail(`${titles[i]}: card did not swap at once`)
    if (!inside(seen, size)) fail(`${titles[i]}: card runs past the window`)
    if (overlap(seen, menu)) fail(`${titles[i]}: card covers the menu`)
    previous = seen.text
  }
  console.log(`  arrowed through ${titles.length}, last: ${previous.slice(0, 70)}`)
  // Hovered: the row under the pointer drives it too.
  const rows = win.locator('.tiptap-slash-menu-list button')
  for (const n of [0, 3, 8]) {
    await rows.nth(n).scrollIntoViewIfNeeded()
    const b = await rows.nth(n).boundingBox()
    await win.mouse.move(b.x + 30, b.y + b.height / 2, { steps: 3 })
    await win.waitForTimeout(40)
    const s = await card(win, '[data-slash-peek]')
    const t = await rows.nth(n).locator('.tiptap-slash-menu-title').textContent()
    console.log(`  hovered ${t.padEnd(16)} ${s?.text.slice(0, 70)}`)
    if (!s) fail(`hover ${t}: no card`)
  }
  // The callout, for the picture.
  await win.keyboard.type('callout')
  await win.waitForTimeout(700)
  const last = await card(win, '[data-slash-peek]')
  if (!last?.text.includes('stand out')) fail(`${label}: no Callout card after typing: ${last?.text}`)
  const menuNow = await win.evaluate(() => { const r = document.querySelector('.tiptap-slash-menu').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } })
  if (last && (!inside(last, size) || overlap(last, menuNow))) fail(`${label}: Callout card misplaced ${JSON.stringify(last)}`)
  if (shot) await win.screenshot({ path: `${dir}/${shot}` })
  await win.keyboard.press('Escape')
  for (let i = 0; i < 8; i++) await win.keyboard.press('Backspace')
}

try {
  await c.theme('paper')
  await sidebar('light')
  await go('day')
  await h.waitForTimeout(1200)
  await slash('light, main window', h, 'slash-callout-light.png')
  await c.theme('github')
  await sidebar('dark')
  await go('day')
  await h.waitForTimeout(1200)
  await slash('dark, main window', h, 'slash-callout-dark.png')
  // Brutal, and the box's narrow window, where the card has to flip.
  await h.evaluate(() => localStorage.setItem('style', 'brutal'))
  await c.theme('paper')
  await go('home')
  const gems = h.locator('aside button[aria-label="Gems"]').first()
  const g = await gems.boundingBox()
  await h.mouse.move(g.x + 20, g.y + g.height / 2, { steps: 3 })
  await h.waitForTimeout(900)
  await h.screenshot({ path: `${dir}/sidebar-gems-brutal.png` })
  await h.evaluate(() => localStorage.removeItem('style'))
  await page.reload()
  await page.waitForTimeout(1500)
  await slash('box', page, 'slash-box.png')
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
  console.log(fails.length ? `${fails.length} failed` : 'all passed')
} finally {
  await c.close()
}
process.exit(fails.length ? 1 : 0)
