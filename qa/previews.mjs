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
    new MutationObserver(() => {
      const el = document.querySelector('[data-peek-card]')
      if (el && el !== window.__peek.el) (window.__peek.el = el, window.__peek.shown = performance.now())
      if (!el && window.__peek.el) (window.__peek.el = null, window.__peek.gone = performance.now())
    }).observe(document.body, { childList: true, subtree: true })
  })
  let first = true
  let previous = ''
  let lastAt = 0
  for (const name of rows) {
    const named = h.locator(`aside button[data-side-row][aria-label="${name}"]`)
    const row = (await named.count()) ? named.first() : h.locator('aside button[data-side-row]:not([aria-label])', { hasText: new RegExp(`^${name}`) }).first()
    if (!(await row.isVisible())) { fail(`${name}: not visible to hover`); continue }
    const before = await row.boundingBox()
    await row.scrollIntoViewIfNeeded()
    // The list may glide rather than jump: read where the row lands.
    await h.waitForTimeout(250)
    const r = await row.boundingBox()
    // Scrolled under a still pointer: the list moved, the hand did not, so the next card waits its delay again.
    if (Math.abs(before.y - r.y) > 1) (first = true, await h.waitForTimeout(1000))
    // A slow machine taking longer than the provider's 900ms between rows is a fresh hover, not a swap.
    if (Date.now() - lastAt > 800) first = true
    const started = Date.now()
    await h.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 4 })
    // The first one waits for the hover delay; after it, each swaps in at once.
    let seen = null
    for (let i = 0; i < (first ? 80 : 20); i++) {
      seen = await card(h, '[data-peek-card]')
      if (seen && seen.text !== previous) break
      await h.waitForTimeout(25)
    }
    const timed = await h.evaluate(() => ({ took: window.__peek.shown - window.__peek.enter, gap: window.__peek.enter - (window.__peek.gone ?? 0) }))
    const took = Math.round(timed.took) || Date.now() - started
    // Under heavy load the pointer can take longer than the provider's 900ms to cross from one row to the next: a fresh hover, not a swap.
    if (!first && timed.gap > 850) first = true
    if (!seen || seen.text === previous) { fail(`${name}: no card`); continue }
    if (!first && seen.state !== 'instant-open') fail(`${name}: swapped with a fade (${seen.state})`)
    if (!first && took > 400) fail(`${name}: swap took ${took}ms`)
    if (!inside(seen, win)) fail(`${name}: card runs past the window ${JSON.stringify(seen)}`)
    const rowBox = { left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }
    if (overlap(seen, rowBox)) fail(`${name}: card covers its row`)
    if (!/^.+?:/.test(seen.text)) fail(`${name}: no lead line: ${seen.text.slice(0, 60)}`)
    console.log(`  ${name.padEnd(20)} ${first ? 'delayed' : `${took}ms`.padEnd(7)} ${seen.text.slice(0, 90)}`)
    previous = seen.text
    first = false
    lastAt = Date.now()
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

/** The Vigil menu at the sidebar's foot: a card for each row, and Tidy stickies only with a sticky out. */
async function vigilMenu(label, shots) {
  await go('home')
  await h.mouse.move(700, 400)
  const openMenu = async () => {
    await h.locator('button[aria-label="Vigil menu"]').click()
    await h.waitForSelector('[role="menu"] [data-peek]')
    await h.waitForTimeout(250)
  }
  const shut = async () => { await h.keyboard.press('Escape'); await h.waitForTimeout(300) }
  // Every sticky put away first: nothing to tidy.
  await c.v('settings:set', { stickiesShown: false })
  await h.waitForTimeout(1200)
  const out = await h.evaluate(() => window.api.stickiesOut())
  if (out !== 0) fail(`${label}: ${out} stickies still counted out after putting them all away`)
  await openMenu()
  const hasTidy = async () => (await h.locator('[role="menu"] [data-peek="tidy"]').count()) > 0
  if (out === 0 && (await hasTidy())) fail(`${label}: Tidy stickies offered with no sticky out`)
  await shut()
  // ⌘K too.
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('Tidy stickies')
  await h.waitForTimeout(500)
  const inSearch = await h.evaluate(() => [...document.querySelectorAll('[role="option"], [cmdk-item]')].some((one) => one.textContent.includes('Tidy stickies')))
  if (out === 0 && inSearch) fail(`${label}: ⌘K offers Tidy stickies with no sticky out`)
  await shut()
  // Shown again, and one more stuck out: it is offered.
  await c.v('settings:set', { stickiesShown: true })
  const one = (await h.evaluate(() => window.api.captures.list())).find((c) => c.status === 'open')
  await h.evaluate((id) => window.api.stick('capture', id, true), one.id)
  await h.waitForTimeout(1500)
  const now = await h.evaluate(() => window.api.stickiesOut())
  await openMenu()
  if (now > 0 && !(await hasTidy())) fail(`${label}: no Tidy stickies with ${now} sticky out`)
  console.log(`${label}: stickies out before ${out}, after ${now}; Tidy offered ${await hasTidy()}`)
  // Each row, pointed at: its card, beside the menu.
  const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [data-peek]')].map((one) => one.dataset.peek))
  const size = await view(h)
  let first = true
  for (const id of rows) {
    const row = h.locator(`[role="menu"] [data-peek="${id}"]`)
    const b = await row.boundingBox()
    await h.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 3 })
    let seen = null
    for (let i = 0; i < (first ? 60 : 10); i++) { seen = await card(h, '[data-menu-peek]'); if (seen) break; await h.waitForTimeout(25) }
    const menu = await h.evaluate(() => { const r = document.querySelector('[role="menu"]').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom } })
    if (!seen) { fail(`menu ${id}: no card`); continue }
    if (!inside(seen, size)) fail(`menu ${id}: card past the window`)
    if (overlap(seen, menu)) fail(`menu ${id}: card covers the menu`)
    console.log(`  ${id.padEnd(10)} ${seen.text.slice(0, 90)}`)
    first = false
    if (shots[id]) { await h.waitForTimeout(1600); await h.screenshot({ path: `${dir}/${shots[id]}` }) }
  }
  // The arrows drive it too.
  await h.keyboard.press('ArrowDown')
  await h.waitForTimeout(60)
  const keyed = await card(h, '[data-menu-peek]')
  const lit = await h.evaluate(() => document.querySelector('[role="menu"] [data-highlighted]')?.dataset.peek)
  if (!keyed) fail(`${label}: no card on arrowing to ${lit}`)
  await shut()
  await h.evaluate((id) => window.api.stick('capture', id, false), one.id)
  await h.waitForTimeout(800)
}

try {
  await c.theme('paper')
  await vigilMenu('light menu', { safe: 'menu-safe-light.png', blur: 'menu-blur-light.png', tidy: 'menu-tidy-light.png' })
  await sidebar('light')
  await go('day')
  await h.waitForTimeout(1200)
  await slash('light, main window', h, 'slash-callout-light.png')
  await c.theme('github')
  await vigilMenu('dark menu', { safe: 'menu-safe-dark.png', tidy: 'menu-tidy-dark.png' })
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
