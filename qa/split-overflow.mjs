// Nothing runs off its card in a narrow pane. A page in a split pane of a wide
// window only has the pane's width, so a layout that switched on the window's
// width (sm:, md:, min-[900px]:) kept its wide shape there and ran off the card.
// Opens every main page in the right pane of a split at a 1280 window (each
// pane about 500px), then alone in a 560 window, and reports every element
// whose right edge passes the right edge of its card (a rounded box with its
// own surface), of a box that clips it, or of the pane; and any page that
// scrolls sideways. Sideways scrollers made so on purpose (data-swipe-own,
// carousels, the board, the map, a drawing) are left out, and so is text
// cut with an ellipsis. Screenshots of the worst go to QA_SHOTS.
//
//   npx electron-vite build --outDir out-split
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-split/main/index.js HALIGTREE_QA_AWAY=1 node qa/split-overflow.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const shots = process.env.QA_SHOTS ?? `${process.env.QA_DATA ?? '/tmp'}/split-overflow`
mkdirSync(shots, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

const c = await sandbox({ width: 1280, height: 860 })
const { h, go, send, v, size } = c
const wait = (ms = 700) => h.waitForTimeout(ms)
const blur = () => h.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())

/** What runs past an edge in the pane in front (or the only pane): one line per offender, the outermost only. */
const overflow = () => h.evaluate(() => {
  const pane = document.querySelector('[data-pane][data-pane-front] [data-pane-card]') ?? document.querySelector('[data-pane] [data-pane-card]')
  if (!pane) return { width: 0, found: ['no pane'], sideways: [] }
  const paneBox = pane.getBoundingClientRect()
  const on = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' }
  // Sideways on purpose: a strip that scrolls, a swipe, a carousel, the board, a canvas.
  const meant = (el) => el.closest('[data-swipe-own], [data-carousel], .mf-carousel, [data-board], canvas, svg, .excalidraw, .tiptap-excalidraw-canvas, [data-map], [data-graph], .react-flow, [data-pdf-page], [data-sonner-toaster]')
  // A strip made to scroll across. A page that scrolls down computes overflow-x auto too, but it is not one:
  // something past its right edge there runs off the page.
  const sidewaysScroller = (el) => { const s = getComputedStyle(el); return /(auto|scroll)/.test(s.overflowX) && !(/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) }
  // Drawn for looks (a sheen, a cover's picture): nothing to read or press in it.
  const decoration = (el) => !!el.closest('[aria-hidden="true"]') || (getComputedStyle(el).pointerEvents === 'none' && !(el.textContent ?? '').trim())
  const cardLike = (el) => {
    const s = getComputedStyle(el)
    const radius = parseFloat(s.borderTopRightRadius) > 0
    const surface = (s.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor)) || parseFloat(s.borderRightWidth) > 0 || s.backgroundImage !== 'none'
    return radius && surface
  }
  const found = []
  const flagged = new Set()
  for (const el of pane.querySelectorAll('*')) {
    if (!on(el) || meant(el) || decoration(el)) continue
    const box = el.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) continue
    if ([...flagged].some((one) => one.contains(el))) continue
    let edge = null
    for (let up = el.parentElement; up && up !== pane.parentElement; up = up.parentElement) {
      if (up !== pane && sidewaysScroller(up)) { edge = null; break }
      const s = getComputedStyle(up)
      if (s.textOverflow === 'ellipsis' && /(hidden|clip)/.test(s.overflowX)) { edge = null; break }
      const clips = /(hidden|clip)/.test(s.overflowX)
      const ub = up.getBoundingClientRect()
      if ((up === pane || clips || cardLike(up)) && box.right > ub.right + 1.5 && box.left < ub.right) {
        // Something placed outside on purpose, wholly past the box (a tip, a handle), is not running off it.
        edge ??= { up, by: Math.round(box.right - ub.right) }
      }
      if (up === pane) break
    }
    if (!edge) continue
    flagged.add(el)
    const name = (one) => `${one.tagName.toLowerCase()}${[...one.attributes].filter((a) => a.name.startsWith('data-') && a.name !== 'data-state').slice(0, 2).map((a) => `[${a.name}${a.value ? `=${a.value.slice(0, 20)}` : ''}]`).join('')}${one.className && typeof one.className === 'string' ? '.' + one.className.split(' ').slice(0, 3).join('.') : ''}`
    found.push(`${name(el)} "${(el.textContent ?? '').trim().slice(0, 30)}" +${edge.by}px past ${edge.up === pane ? 'the pane' : name(edge.up)}`)
  }
  // The page itself must not scroll sideways: any vertical scroller in the pane wider inside than out.
  const sideways = [...pane.querySelectorAll('*')].filter((el) => {
    if (!on(el) || meant(el)) return false
    const s = getComputedStyle(el)
    // A strip that only scrolls sideways (Files' recent row) is one on purpose; a page that scrolls down must not also scroll across.
    return /(auto|scroll)/.test(s.overflowY) && !/(hidden|clip)/.test(s.overflowX) && el.scrollHeight > el.clientHeight + 1 && el.scrollWidth > el.clientWidth + 2 && el.clientHeight > 100
  }).map((el) => {
    const right = el.getBoundingClientRect().right
    const widest = [...el.querySelectorAll('*')].filter((one) => one.getBoundingClientRect().right > right + 2).find((one) => one.parentElement.getBoundingClientRect().right <= right + 2)
    return `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} ${el.scrollWidth}>${el.clientWidth}${widest ? ` by ${widest.tagName.toLowerCase()}.${String(widest.className).split(' ').slice(0, 4).join('.')} "${widest.textContent.trim().slice(0, 30)}"` : ''}`
  })
  // Too short a window: something cut at the foot of a box that clips it (not a scroller), and nothing past the pane's foot.
  for (const el of pane.querySelectorAll('*')) {
    // Pictures and marks placed absolutely inside a cover are cropped by design.
    if (!on(el) || meant(el) || decoration(el) || /(absolute|fixed)/.test(getComputedStyle(el).position) || [...flagged].some((one) => one.contains(el))) continue
    const box = el.getBoundingClientRect()
    if (box.width < 2 || box.height < 2) continue
    for (let up = el.parentElement; up && up !== pane.parentElement; up = up.parentElement) {
      const s = getComputedStyle(up)
      // A scroller shut because only its foot padding is past it (useScrollOnlyWhenNeeded in ui.tsx) is still a scroller.
      if (/(auto|scroll)/.test(s.overflowY) || up.style.overflowY === 'hidden' || s.webkitLineClamp !== 'none' || (s.textOverflow === 'ellipsis')) break
      if (up === pane || /(hidden|clip)/.test(s.overflowY)) {
        const ub = up.getBoundingClientRect()
        if (box.bottom > ub.bottom + 4.5 && box.top < ub.bottom - 1) {
          flagged.add(el)
          found.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 3).join('.')} "${(el.textContent ?? '').trim().slice(0, 30)}" cut ${Math.round(box.bottom - ub.bottom)}px at the foot of ${up === pane ? 'the pane' : up.tagName.toLowerCase() + '.' + String(up.className).split(' ').slice(0, 3).join('.')} (overflow-y ${s.overflowY})`)
        }
        break
      }
    }
  }
  // Controls in a header never lie over one another (the Calendar's late pill over ‹ Today ›).
  for (const head of pane.querySelectorAll('header')) {
    const parts = [...head.querySelectorAll('button, [data-late], h1, h2, [role=radiogroup], [role=tablist]')].filter((el) => on(el) && el.getBoundingClientRect().width > 2)
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j]
      if (a.contains(b) || b.contains(a)) continue
      const x = a.getBoundingClientRect(), y = b.getBoundingClientRect()
      const w = Math.min(x.right, y.right) - Math.max(x.left, y.left), hh = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top)
      if (w > 2 && hh > 2) found.push(`"${a.textContent.trim().slice(0, 20) || a.getAttribute('aria-label')}" lies over "${b.textContent.trim().slice(0, 20) || b.getAttribute('aria-label')}" in the header`)
    }
  }
  return { width: Math.round(paneBox.width), height: Math.round(paneBox.height), found, sideways }
})

/** The tabs of the page's own chip row (Feed's, Review's, Stats', Tasks'), or Files' kinds. */
const tabsOf = () => h.evaluate(() => {
  const pane = document.querySelector('[data-pane][data-pane-front] [data-pane-card]') ?? document.querySelector('[data-pane] [data-pane-card]')
  const row = pane?.querySelector('[data-chips="feed"], [data-chips="review"], [data-chips="stats"], [data-chips="tasks"], [data-media-kinds]')
  return row ? [...row.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean) : []
})
const clickTab = (label) => h.evaluate((label) => {
  const pane = document.querySelector('[data-pane][data-pane-front] [data-pane-card]') ?? document.querySelector('[data-pane] [data-pane-card]')
  const row = pane?.querySelector('[data-chips="feed"], [data-chips="review"], [data-chips="stats"], [data-chips="tasks"], [data-media-kinds]')
  ;[...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === label)?.click()
}, label)
const firstRow = () => h.evaluate(() => {
  const pane = document.querySelector('[data-pane][data-pane-front] [data-pane-card]') ?? document.querySelector('[data-pane] [data-pane-card]')
  const row = pane?.querySelector('[data-row][data-id], [data-source-row], [data-person-row]')
  if (row instanceof HTMLElement) { row.click(); return true }
  return false
})

/** Files' kinds: each pile on its front opens one kind. */
const piles = () => h.evaluate(() => [...(document.querySelector('[data-pane][data-pane-front] [data-files-piles]') ?? document.querySelector('[data-files-piles]'))?.children ?? []].map((one) => one.textContent.trim().split(/\d/)[0].trim()))
const openPile = (n) => h.evaluate((n) => { const one = (document.querySelector('[data-pane][data-pane-front] [data-files-piles]') ?? document.querySelector('[data-files-piles]'))?.children[n]; (one?.querySelector('button, [role=button]') ?? one)?.click() }, n)

const PAGES = [
  ['Home', 'home'], ['Inbox', 'inbox'], ['Writing', 'articles'], ['Writing, a note', 'articles', 'row'],
  ['Journal Day', 'day'], ['Journal Week', 'weekpage'], ['Journal Month', 'monthpage'], ['Journal Year', 'yearpage'],
  ['Tasks', 'today', 'tabs'], ['Calendar', 'calendar'], ['Review', 'review', 'tabs', ':decks'], ['Gems', 'nuggets'],
  ['Feed', 'feed', 'tabs'], ['Queue', 'queue'], ['Sources', 'sources'], ['Sources, a page', 'sources', 'row'],
  ['Files', 'media', 'tabs'], ['Goals', 'goals'], ['Stats', 'stats', 'tabs'], ['Map', 'map'], ['Settings', 'settings'],
  ['What Haligtree can do', 'powers']
]

const all = []
const visit = async (where) => {
  for (const [label, id, extra, focus] of PAGES) {
    await go(id, focus); await wait(500)
    if (extra === 'row') { await firstRow(); await wait(900) }
    const views = extra === 'tabs' ? await tabsOf() : []
    const kinds = id === 'media' ? await piles() : []
    for (const tab of views.length ? views : kinds.length ? [null, ...kinds] : [null]) {
      if (tab && kinds.length) { await go(id); await wait(400); await openPile(kinds.indexOf(tab)); await wait(900) } else if (tab) { await clickTab(tab); await wait(800) }
      const name = `${where}: ${label}${tab ? ` › ${tab}` : ''}`
      let got = await overflow()
      // A page that is still opening holds its scroller shut for a moment: only what stays wrong counts.
      if (got.found.length || got.sideways.length) { await wait(1500); got = await overflow() }
      all.push({ name, ...got })
      console.log(`${got.found.length || got.sideways.length ? 'OVER' : 'ok  '}  ${name} (pane ${got.width}x${got.height})${got.found.length ? '\n        ' + got.found.slice(0, 6).join('\n        ') : ''}${got.sideways.length ? '\n        sideways: ' + got.sideways.join('; ') : ''}`)
      if (got.found.length || got.sideways.length) await h.screenshot({ path: `${shots}/${name.replace(/[^a-z0-9]+/gi, '-')}.png` })
    }
  }
}

/** The Calendar's header in a pane of 740, 600 and 500px, then while a note is dragged across the window, read every 50ms. */
const calendarHead = async () => {
  const read = () => h.evaluate(() => {
    const pane = document.querySelector('[data-pane][data-pane-front] [data-pane-card]')
    const head = pane?.querySelector('header')
    if (!head) return null
    const parts = [...head.querySelectorAll('[data-late], [data-cal-step], [data-cal-jump], [data-cal-left-toggle], [data-cal-new-event]')].filter((el) => el.getBoundingClientRect().width > 0)
    let over = 0
    for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
      const x = parts[i].getBoundingClientRect(), y = parts[j].getBoundingClientRect()
      if (parts[i].contains(parts[j]) || parts[j].contains(parts[i])) continue
      if (Math.min(x.right, y.right) - Math.max(x.left, y.left) > 1 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 1) over++
    }
    const late = head.querySelector('[data-late]')
    return { pane: Math.round(pane.getBoundingClientRect().width), over, late: late ? late.textContent.trim() : '-', shape: parts.map((el) => `${Math.round(el.getBoundingClientRect().left)},${Math.round(el.getBoundingClientRect().top)}`).join(' ') }
  })
  // A late task, so the pill is there.
  await v('task:add', 'Return the library books yesterday').catch(() => {})
  for (const [width, want] of [[1790, 740], [1510, 600], [1310, 500]]) {
    await size(width, 860); await go('calendar'); await wait(1200)
    const got = await read()
    check(`Calendar header in a ${want}px pane: nothing over anything`, got && got.over === 0, JSON.stringify(got))
    await h.screenshot({ path: `${shots}/calendar-head-${want}.png` })
  }
  // A note from the Inbox (left pane) dragged across the window, every 50ms.
  const row = await h.evaluate(() => { const r = document.querySelector('[data-pane]:not([data-pane-front]) [data-row][data-id]')?.getBoundingClientRect(); return r && { x: r.left + 40, y: r.top + r.height / 2 } })
  // The frame before the drag counts too: the header must not jump as the drag starts.
  const frames = [await read()]
  if (row) {
    await h.mouse.move(row.x, row.y); await h.mouse.down()
    for (let i = 0; i <= 30; i++) {
      await h.mouse.move(row.x + i * 30, row.y + Math.sin(i / 4) * 60, { steps: 2 })
      await h.waitForTimeout(50)
      frames.push(await read())
      if (i % 6 === 0) await h.screenshot({ path: `${shots}/calendar-drag-${String(i).padStart(2, '0')}.png` })
    }
    await h.mouse.move(row.x, row.y, { steps: 4 }); await h.mouse.up()
  }
  const shapes = new Set(frames.filter(Boolean).map((one) => one.shape))
  check('dragging a note across: the header never overlaps', frames.length > 0 && frames.every((one) => one && one.over === 0), `${frames.length} frames`)
  check('dragging a note across: the header holds one layout', shapes.size === 1, [...shapes].join(' | '))
  await size(1280, 860); await wait(600)
}

try {
  await v('settings:set', { hintRate: 0 })
  // A book's cards made from its PDF, on two pages, so Decks shows "How much of each book has cards".
  const book = 'The Very Long Title of a Law Book About Constitutional Sovereignty'
  for (const page of [3, 12, 40]) {
    const id = await v('nugget:from', `![](haligtree://assets/p${page}.png)\n\n[${book}, p. ${page}](haligtree://pdf/law.pdf#page=${page})`, { medium: book, passage: `p. ${page}` })
    await v('item:save', id, { prompt: `What is on page ${page}?`, title: `What is on page ${page}?` })
  }
  // The check itself sees a thing running off a card: something too wide put into one, then taken out.
  await go('review', ':decks')
  for (let i = 0; i < 20 && !(await h.evaluate(() => !!document.querySelector('[data-book-coverage]'))); i++) await wait(300)
  await h.evaluate(() => { const card = document.querySelector('[data-book-coverage]'); const wide = document.createElement('div'); wide.id = 'qa-too-wide'; wide.style.width = '3000px'; wide.style.height = '10px'; card?.append(wide) })
  const caught = await overflow()
  await h.evaluate(() => document.getElementById('qa-too-wide')?.remove())
  check('the check catches a thing wider than its card', caught.found.some((line) => line.includes('px past')), caught.found[0])
  await go('inbox'); await blur()
  await h.keyboard.press('Meta+Backslash'); await wait(1000)
  const panes = await h.evaluate(() => document.querySelectorAll('[data-pane]').length)
  check('⌘\\ makes a split', panes === 2)
  // PASSES picks some: split (1280x860, two panes), short (1280x520, two panes), narrow (560x700), small (560x400).
  const passes = (process.env.PASSES ?? 'split,short,narrow,small').split(',')
  if (passes.includes('cal')) await calendarHead()
  if (passes.includes('split')) await visit('split 1280x860')
  if (passes.includes('short')) { await size(1280, 520); await wait(800); await visit('split 1280x520') }
  await h.evaluate(() => document.querySelector('[data-pane][data-pane-front] [data-tab-on] [data-tab-close]')?.click()); await wait(800)
  if (passes.includes('narrow')) { await size(560, 700); await wait(800); await visit('560x700') }
  if (passes.includes('small')) { await size(560, 400); await wait(800); await visit('560x400') }
  const bad = all.filter((one) => one.found.length || one.sideways.length)
  check('nothing runs off its card or scrolls sideways', !bad.length, bad.map((one) => one.name).join(', '))
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5).join('\n'))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed  (shots in ${shots})`)
process.exit(passed === results.length ? 0 : 1)
