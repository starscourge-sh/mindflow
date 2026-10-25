// Every list page has two left edges and the text edge of its rows, nothing
// else. Measured from the left of the page's column:
//   the box edge   the add box's border, a tab's pill, the example card's
//                  border, a heading's rule, a row's highlight
//   the ink edge   the header's count, the + in the add box, a tab's words,
//                  a banner's words, a heading's words, a row's tick or first mark
//   the text edge  a task's title, and the lines and cards under it
// Read off the first ink of each block (its first letter or mark, a border's
// own line), in a dark and a light theme, at two window widths, on Today,
// Tomorrow, Upcoming, Later, Routines, the Matrix, This week's tasks, the
// Inbox, Everything, Writing, Gems, Questions, Goals, the Bin, Archived, a
// tag's page, an empty list's example and quick capture's lists.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=dir] [REPORT=file.json] node qa/list-edges.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const report = []

// Each block's left, from the column's left. `ink` is where its first letter
// or mark starts; `box` is its own border or fill.
const measure = (w, scope) => w.evaluate((scope) => {
  const root = document.querySelector(scope) ?? document.body
  const seen = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight
  const col = (root.matches('[data-tag-stream]') ? root : root.querySelector('.page-column:not(header)') ?? root.querySelector('[data-box-panel] > [role=tablist]') ?? root).getBoundingClientRect().left
  const x = (n) => Math.round((n - col) * 2) / 2
  // The first ink of a mark: where its drawn lines start, not its square.
  const markLeft = (node) => {
    const r = node.getBoundingClientRect()
    if (node.tagName.toLowerCase() !== 'svg' || !node.viewBox?.baseVal?.width) return r.left
    try { const b = node.getBBox(); return r.left + ((b.x - node.viewBox.baseVal.x) * r.width) / node.viewBox.baseVal.width } catch { return r.left }
  }
  const ink = (el) => {
    let best = Infinity
    const visit = (node) => {
      if (node.nodeType === 3) {
        if (!node.textContent.trim()) return
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of range.getClientRects()) if (seen(r)) { best = Math.min(best, r.left); break }
        return
      }
      if (node.nodeType !== 1) return
      const style = getComputedStyle(node)
      if (style.visibility === 'hidden' || +style.opacity === 0 || style.display === 'none' || node.matches('[data-highlight], [aria-hidden=true]:not(svg), .sr-only')) return
      // A tile, chip or pill drawn around a mark starts where its fill or border does.
      if (node !== el && node.getBoundingClientRect().width < el.getBoundingClientRect().width / 2 && ((parseFloat(style.borderLeftWidth) > 0 && !/rgba\(.*, 0\)|transparent/.test(style.borderLeftColor)) || !/rgba\(.*, 0\)|transparent/.test(style.backgroundColor) || style.backgroundImage !== 'none' || (style.overflow === 'hidden' && style.borderTopLeftRadius !== '0px' && node.querySelector('img, span')))) { const r = node.getBoundingClientRect(); if (seen(r)) { best = Math.min(best, r.left); return } }
      if (node.matches('svg, img, [data-task-tick], input[type=checkbox], [role=checkbox]')) { const r = node.getBoundingClientRect(); if (seen(r)) best = Math.min(best, markLeft(node)); return }
      if (node.matches('input, textarea')) { const r = node.getBoundingClientRect(); if (seen(r)) best = Math.min(best, r.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth)); return }
      for (const child of node.childNodes) visit(child)
    }
    visit(el)
    return best === Infinity ? null : x(best)
  }
  const cardOf = (row) => {
    for (let up = row.parentElement; up && up !== root; up = up.parentElement) {
      const style = getComputedStyle(up)
      if (parseFloat(style.borderLeftWidth) > 0 && !/rgba\(.*, 0\)|transparent/.test(style.borderLeftColor) && !up.matches('[data-example-frame], [data-example-frame] *')) return up
    }
    return null
  }
  const inPage = (el) => seen(el.getBoundingClientRect()) && !el.closest('[data-task-detail], .note-pane, [data-radix-popper-content-wrapper]')
  const all = (sel) => [...root.querySelectorAll(sel)].filter(inPage)
  const out = {}
  const add = (role, value) => { if (value === null || value === undefined) return; (out[role] ??= new Set()).add(value) }
  const header = root.querySelector(':scope > section > header, section > header')
  // A bar that leads with tabs (Tasks): the first tab's pill on the box edge, its word on the ink edge; else the count.
  // (its tabs are measured with every row of tabs, below)
  if (header && !header.querySelector('[data-list-tabs]')) { const count = [...header.querySelectorAll('span')].find((one) => /\d/.test(one.textContent) && seen(one.getBoundingClientRect())); if (count) add('header words', ink(count)) }
  for (const tabs of all('[data-task-lists], [data-list-tabs]')) { const first = tabs.querySelector('button'); if (first) { add('tab pill', x(first.getBoundingClientRect().left)); add('tab words', ink(first)) } }
  for (const form of all('form')) {
    if (!form.querySelector('input, [contenteditable]')) continue
    const style = getComputedStyle(form)
    if (parseFloat(style.borderLeftWidth) === 0) continue
    add('add box', x(form.getBoundingClientRect().left))
    const mark = form.querySelector('svg')
    if (mark) add('add +', x(markLeft(mark)))
  }
  for (const one of all('[data-day-progress], [data-day-budget], [data-today-cap], [data-banner]')) add('banner words', ink(one))
  for (const one of all('[data-kind-chips], [data-everything-filter]')) add('chips', ink(one))
  for (const one of all('[data-example-frame] > [role=note]')) { add('example card', x(one.getBoundingClientRect().left)); add('example words', ink(one)) }
  const rows = [...new Set(all('[data-task-row], [data-row][data-id], [data-tag-stream] article').filter((one) => !one.parentElement.closest('[data-task-row]'))
    .map((one) => (!one.matches('[data-task-row]') && one.parentElement.querySelector('[data-task-tick]') && one.parentElement.querySelectorAll('[data-row]').length === 1 ? one.parentElement : one)))]
  for (const head of all('h2, h3, [data-list-head]')) {
    if (head.closest('[data-task-row], [data-row], header, [role=note], [data-week-day], [data-quadrant] [data-task-row], article') || cardOf(head)) continue
    // A heading in a list: one whose list has rows.
    const list = head.closest('[data-page]') ?? root
    if (!list.querySelector('[data-task-row], [data-row], article')) continue
    add('heading words', ink(head))
    const style = getComputedStyle(head)
    if (parseFloat(style.borderBottomWidth) > 0) add('heading rule', x(head.getBoundingClientRect().left))
  }
  for (const row of rows) {
    const tick = row.querySelector('[data-task-tick]')
    const r = row.getBoundingClientRect()
    if (row.closest('[data-week-day], [data-quadrant]')) continue
    // A row inside a card (the Inbox's kinds): the card is the box on the edge, and its rows line up inside it.
    const card = cardOf(row)
    if (card) { add('card box', x(card.getBoundingClientRect().left)); continue }
    add('row box', x(r.left))
    add('row first ink', tick ? x(tick.getBoundingClientRect().left) : ink(row))
    const title = row.querySelector('[data-task-title]')
    if (title) add('task words', x(title.getBoundingClientRect().left))
    for (const under of row.querySelectorAll('[data-task-meta], [data-task-ask]')) if (seen(under.getBoundingClientRect())) add('under the words', x(under.getBoundingClientRect().left))
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort((a, b) => a - b)]))
}, scope)

// The rule: boxes on one edge, ink on one edge, text and what hangs under it on one.
const BOX = ['card box', 'tab pill', 'add box', 'example card', 'heading rule', 'row box']
const INK = ['chips', 'header words', 'tab words', 'add +', 'banner words', 'heading words', 'row first ink', 'example words']
function judge(name, got, { box = BOX, ink = INK } = {}) {
  const boxes = [...new Set(box.flatMap((role) => got[role] ?? []))]
  const inks = [...new Set(ink.flatMap((role) => got[role] ?? []))]
  const words = [...new Set([...(got['task words'] ?? []), ...(got['under the words'] ?? [])])]
  const spread = (list) => (list.length ? Math.max(...list) - Math.min(...list) : 0)
  check(`${name}: boxes share one edge`, spread(boxes) <= 1, boxes.join(' / '))
  check(`${name}: words and marks start on one edge`, spread(inks) <= 1, inks.join(' / '))
  if (words.length) check(`${name}: a task's words and what hangs under them share one edge`, spread(words) <= 1, words.join(' / '))
  if (boxes.length && inks.length) check(`${name}: the ink edge sits inside the box edge`, Math.min(...inks) > Math.max(...boxes), `${Math.max(...boxes)} < ${Math.min(...inks)}`)
}

const c = await sandbox({ width: 1400, height: 900 })
const { h, page: box, go, v, size } = c
// Tomorrow and This week's tasks are the top of Upcoming now, Everything the Inbox with "Show sorted too" on.
const PAGES = [['Today', 'today'], ['Upcoming', 'upcoming'], ['Later', 'later'], ['Routines', 'routines'], ['Urgent and important', 'matrix'],
  ['Inbox', 'inbox'], ['Inbox, sorted too', 'all'], ['Writing', 'articles'], ['Gems', 'nuggets'], ['Questions', 'questions'], ['Goals', 'goals'], ['Bin', 'discarded'], ['Archived', 'archived']]
const theme = async (name) => { await h.evaluate((n) => localStorage.setItem('theme', n), name); await h.reload(); await h.waitForTimeout(2000) }

async function walk(label) {
  for (const [name, id] of PAGES) {
    await go(id); await h.waitForTimeout(700)
    const got = await measure(h, '[data-page]:not([hidden])')
    report.push({ at: label, page: name, got })
    // The week and the Matrix are boards: each column or box is its own card, and qa/task-align.mjs lines up the cards in it.
    if (id !== 'week' && id !== 'matrix') judge(`${label} ${name}`, got)
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/${label}-${id}.png` }).catch(() => {})
  }
  const tag = (await v('tags').catch(() => []))?.[0]
  const tagName = tag?.tag ?? tag?.name
  if (tagName) {
    await c.send('tag', tagName); await h.waitForTimeout(1300)
    const got = await measure(h, '[data-tag-stream]')
    report.push({ at: label, page: `#${tagName}`, got })
    judge(`${label} tag page`, got)
    if (SHOTS) await h.screenshot({ path: `${SHOTS}/${label}-tag.png` }).catch(() => {})
  }
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  for (const [w, hh] of [[1400, 900], [900, 700]]) {
    await size(w, hh)
    for (const name of ['dark', 'light']) {
      await theme(name)
      await walk(`${name}-${w}`)
    }
  }
  // An empty list shows its example: Later with nothing in it.
  const open = (await v('tasks')).filter((task) => task.status === 'open' && !task.dueAt)
  for (const task of open) await v('task:save', task.id, { status: 'done' })
  await size(1400, 900); await theme('dark'); await go('later'); await h.waitForTimeout(900)
  const empty = await measure(h, '[data-page]:not([hidden])')
  report.push({ at: 'dark-1400', page: 'Later, empty (example)', got: empty })
  judge('Later empty, its example', empty)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/example-later.png` }).catch(() => {})
  // Quick capture's lists.
  await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(800)
  for (const [n, name] of [[1, 'Inbox'], [2, 'Tasks'], [3, 'Saved']]) {
    await box.evaluate(() => document.activeElement?.blur?.()); await box.keyboard.press(`Control+${n}`); await box.waitForTimeout(800)
    const got = await measure(box, 'body')
    report.push({ at: 'box', page: `Quick capture ${name}`, got })
    judge(`Quick capture ${name}`, got, { box: ['row box', 'card box', 'heading rule', 'add box'], ink: ['row first ink', 'heading words', 'chips', 'add +'] })
    if (SHOTS) await box.screenshot({ path: `${SHOTS}/box-${name}.png` }).catch(() => {})
  }
  await box.keyboard.press('Escape')
} finally {
  await c.close()
}
if (process.env.REPORT) writeFileSync(process.env.REPORT, JSON.stringify(report, null, 1))
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
if (passed !== results.length) process.exitCode = 1
