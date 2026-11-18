// A page keeps its place: its list's scroll, and the row open beside it, are where you left them when you come back
// to it. Each case scrolls a page's own list (inside the page, never the sidebar) with the wheel, as you would, leaves
// it one way and comes back, and reads the list's scroll and the row at its top edge before and after.
//   tab     the Inbox scrolled the moment its list is drawn (still filling), another tab with the longest note, back
//   open    the Inbox with a note open beside its list, the list scrolled, another tab, back: the same note, the same place
//   day     as `tab` on the Inbox's older captures (gone through), launched at 23:59, back after midnight (the app's clock moved)
//   back    the Inbox scrolled, a row opened, ⌘[, ⌘], ⌘[
//   resize  the Inbox scrolled, the window made narrow and wide again
//   pages   `tab` on Home, Gems, Questions, Tasks (All tasks), the Calendar, a Writing folder and Files
//   section the Inbox scrolled, Home from the sidebar, the Inbox from the sidebar again (a new visit, said as it is)
//   fold    the Inbox scrolled; in another tab on the same list, every "Show N more" above that place pressed; back
// On a copy of the main book:
//   QA_DATA=<book copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tab-place.mjs tab|open|day|back|resize|pages
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'fs'
import { loadavg } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

process.env.HALIGTREE_QA_VIRTUAL ??= '1'
const CASE = process.argv[2] ?? 'tab'
const FRAMES = process.env.QA_FRAMES
if (FRAMES) mkdirSync(FRAMES, { recursive: true })
const root = process.env.QA_DATA
const shelf = JSON.parse(readFileSync(join(root, 'books.json'), 'utf8'))
const db = new DatabaseSync(join(root, 'books', shelf.last, 'haligtree.db'), { readOnly: true })
// Long enough to scroll well past a screen, short enough to open at once.
const note = db.prepare("select id from captures where status = 'open' and kind = 'note' and body is not null and length(body) between 40000 and 400000 order by length(body) desc limit 1").get()
db.close()
const { check, done } = checks()
const load = () => `load ${loadavg()[0].toFixed(1)}`
const wide = CASE === 'open'
// The day case runs at 23:59 (the app's clock moved, main and window, as qa/sandbox-lib.mjs's `at` does).
const c = await sandbox({ width: wide ? 1440 : 1100, height: 760, seeded: false, at: CASE === 'day' ? '23:59' : undefined })
const { h, errors, close } = c
const wait = (ms) => h.waitForTimeout(ms)

// The page's own list: the tallest box that scrolls inside the page's card, outside a note's words. Never the
// sidebar's: with one pane on show there is no front pane to look in, and the sidebar was the tallest box in the window
// while the Inbox was still being read (the replay's "list at 0" had scrolled the sidebar and read the Inbox).
const installList = () => h.evaluate(() => {
  window.__placeList = () => {
    const card = document.querySelector('[data-pane-front] [data-pane-card]') ?? document.querySelector('[data-pane-card]')
    if (!card) return null
    // Not the page being left, still on show while the next one reads (page-swap.tsx).
    return [...card.querySelectorAll('*')].filter((one) => !one.closest('.haligtree-editor-content, .note-pane, [data-page-held]') && /auto|scroll/.test(getComputedStyle(one).overflowY) && one.scrollHeight > one.clientHeight + 40).sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? null
  }
})
/** The list's scroll, its height, and the row at its top edge (its id and how far under the edge it starts). */
const place = () => h.evaluate(() => {
  const list = window.__placeList()
  if (!list) return null
  const edge = list.getBoundingClientRect().top
  const row = [...list.querySelectorAll('[data-id], [data-row], [data-task-id], [data-day], tr')].find((one) => one.getBoundingClientRect().height && one.getBoundingClientRect().bottom > edge + 1)
  const id = row?.getAttribute('data-id') ?? row?.getAttribute('data-task-id') ?? row?.getAttribute('data-day') ?? row?.textContent?.trim().slice(0, 30) ?? null
  const open = document.querySelector('[data-pane-card] [data-open][data-id], [data-pane-card] .note-pane[data-open]')
  // The box itself too: its height on show, and anything poking out sideways (which takes a scrollbar's room).
  const box = list.getBoundingClientRect()
  return { top: Math.round(list.scrollTop), tall: list.scrollHeight, row: id && id.slice(0, 30), at: row ? Math.round(row.getBoundingClientRect().top - edge) : null, open: open?.getAttribute('data-id') ?? open?.getAttribute('data-open') ?? null, client: list.clientHeight, box: `${Math.round(box.top)}..${Math.round(box.bottom)}`, wide: list.scrollWidth - list.clientWidth }
})
const show = (p) => (p ? `${p.top}px of ${p.tall} (box ${p.box}, ${p.client} on show${p.wide ? `, ${p.wide} px over sideways` : ''}), top row ${p.row} at ${p.at}${p.open ? `, open ${p.open.slice(0, 8)}` : ''}` : 'no list')
/** The same place: the same row at the list's top edge, within 2 px of where it was (a page's place is that row, kept and
 * put back by it, so what grew above it meanwhile does not count); the list's scroll within 2 px where no row is named. */
const same = (a, b) => !!a && !!b && a.row === b.row && Math.abs((a.at ?? 0) - (b.at ?? 0)) <= 2 && a.open === b.open && (a.row !== null || Math.abs(a.top - b.top) <= 2)
/** As soon as the page's list is drawn and can scroll, the wheel over it: down by `by`, a real wheel, as you would. */
const scrollNow = async (by) => {
  // The Inbox lists its last few days: on a quiet week its list goes only a little past a screen.
  // And under the pointer: while the page being left is held over it, a cover takes the wheel (page-swap.tsx).
  await h.waitForFunction(() => {
    const list = window.__placeList()
    if (!list || list.scrollHeight <= list.clientHeight + 100) return false
    const r = list.getBoundingClientRect()
    return list.contains(document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 200)))
  }, null, { polling: 'raf', timeout: 30000 }).catch(async (error) => {
    // What was there instead, to read: the frame, and what the point lands on.
    await frame('no-list')
    console.log(`no list to scroll: ${JSON.stringify(await h.evaluate(() => { const list = window.__placeList(); const r = list?.getBoundingClientRect(); const at = r && document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 200)); return { list: list ? [list.scrollHeight, list.clientHeight, String(list.className).slice(0, 50)] : null, under: at ? `${at.tagName} ${String(at.className).slice(0, 60)}` : null, page: document.querySelector('[data-page]:not([data-page-held] *)')?.getAttribute('data-page'), dialogs: [...document.querySelectorAll('[role="dialog"]')].map((one) => one.getAttribute('aria-label') ?? one.textContent.slice(0, 40)) } }))}`)
    throw error
  })
  const tallAtWheel = await h.evaluate(() => window.__placeList().scrollHeight)
  const box = await h.evaluate(() => { const r = window.__placeList().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 200) } })
  await h.mouse.move(box.x, box.y)
  await h.mouse.wheel(0, by)
  // The glide lands and the list is done drawing: the place it is left at.
  let last = null
  for (let i = 0; i < 40; i++) {
    await wait(150)
    const now = await place()
    if (last && now && now.top === last.top && now.tall === last.tall) break
    last = now
  }
  const left = await place()
  return { tallAtWheel, left }
}
const frame = async (name) => FRAMES && h.screenshot({ path: join(FRAMES, `${CASE}-${name}.png`) })
/** Frames every 50 ms for half a second, as the page comes back. */
const film = async (name) => { for (let i = 0; i < 10; i++) { await frame(`${name}-${String(i * 50).padStart(3, '0')}ms`); await wait(50) } }
const tabs = () => h.evaluate(() => [...document.querySelectorAll('[data-tab]')].map((one) => ({ key: one.getAttribute('data-tab'), on: one.hasAttribute('data-tab-on') })))
/** Another tab, the longest note open in it, then back to the first: the place it comes back at. */
const awayAndBack = async (between) => {
  await h.click('[data-tab-add]')
  await wait(700)
  await c.send('capture', note.id)
  await h.waitForFunction(() => !!document.querySelector('.haligtree-editor-content'), null, { timeout: 30000 })
  await wait(1200)
  if (between) await between()
  const first = (await tabs())[0]
  await h.click(`[data-tab="${first.key}"] [role="tab"]`)
  await film('back')
  await wait(1000)
  return place()
}
/** The Inbox with a list long enough to scroll: on a book whose last few days are quiet, its older captures, gone through. */
const inbox = async () => {
  await c.send('view', 'inbox')
  await h.waitForFunction(() => { const list = window.__placeList(); return (list && list.scrollHeight > list.clientHeight + 300) || [...document.querySelectorAll('[data-pane-card] button')].some((one) => one.textContent.trim() === 'Go through them') }, null, { timeout: 30000 })
  const older = await h.evaluate(() => { const list = window.__placeList(); if (list && list.scrollHeight > list.clientHeight + 300) return false; [...document.querySelectorAll('[data-pane-card] button')].find((one) => one.textContent.trim() === 'Go through them').click(); return true })
  if (older) { console.log('the Inbox\'s last days are short: its older captures, gone through'); await wait(800) }
}
/** Through the sidebar, as a person goes there. */
const side = async (label) => { await h.click(`aside nav button[aria-label="${label}"]`); await wait(900) }

try {
  console.log(`build ${process.env.QA_ENTRY.split('/').slice(-3, -2)}; ${CASE}; note ${note?.id} (${load()})`)
  await installList()
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
  await h.evaluate(() => window.api.haligtree('settings:set', { hintRate: 0 }))
  if (CASE === 'tab' || CASE === 'day') {
    if (CASE === 'day') await c.send('view', 'inbox'); else await inbox()
    if (CASE === 'day') {
      // That late the last few days' list fits the window whole: the older captures, gone through, are the long list.
      await h.waitForFunction(() => [...document.querySelectorAll('[data-pane-card] button')].some((one) => one.textContent.trim() === 'Go through them'), null, { timeout: 30000 })
      await h.evaluate(() => [...document.querySelectorAll('[data-pane-card] button')].find((one) => one.textContent.trim() === 'Go through them').click())
      await wait(800)
    }
    const { tallAtWheel, left } = await scrollNow(900)
    await frame('left')
    console.log(`left: ${show(left)}; the list was ${tallAtWheel} px tall at the wheel (${tallAtWheel === left?.tall ? 'drawn whole' : 'still filling'})`)
    check('set up: the Inbox list scrolled down', left && left.top > 100, show(left))
    const back = await awayAndBack(CASE === 'day' ? async () => {
      // Past midnight on the app's own clock, the second tab on show.
      for (let i = 0; i < 120 && (await h.evaluate(() => new Date().getHours())) > 12; i++) await wait(1000)
      console.log(`the app's clock: ${await h.evaluate(() => new Date().toString())}`)
      await wait(1500)
    } : undefined)
    console.log(`back: ${show(back)}`)
    check(`the Inbox list where it was left, the same row at its top${CASE === 'day' ? ', the day changed in between' : ''}`, same(left, back), `left ${show(left)}; back ${show(back)}`)
  }
  if (CASE === 'open') {
    await inbox()
    await scrollNow(600)
    // A row on screen opened beside the list, as a click does.
    await h.evaluate(() => { const list = window.__placeList(); const edge = list.getBoundingClientRect(); [...list.querySelectorAll('[data-id]')].find((one) => one.getBoundingClientRect().top > edge.top + 120)?.click() })
    await wait(1500)
    await h.mouse.wheel(0, 300)
    await wait(1200)
    const left = await place()
    await frame('left')
    check('set up: a note open beside the Inbox list, the list scrolled', left && left.open && left.top > 100, show(left))
    const back = await awayAndBack()
    console.log(`left: ${show(left)}\nback: ${show(back)}`)
    check('the same note open, and the list beside it where it was left', same(left, back), `left ${show(left)}; back ${show(back)}`)
  }
  if (CASE === 'fold') {
    await inbox()
    const { left } = await scrollNow(900)
    await frame('left')
    check('set up: the Inbox list scrolled down', left && left.top > 100, show(left))
    // The other tab on the same list: the Inbox with its first row open beside it.
    const first = await h.evaluate(() => window.__placeList()?.querySelector('[data-id]')?.getAttribute('data-id'))
    await h.click('[data-tab-add]')
    await wait(700)
    await c.send('capture', first)
    await h.waitForFunction(() => !!window.__placeList(), null, { timeout: 30000 })
    await wait(1200)
    // Every "Show N more" above the first tab's row, pressed as a person presses it.
    let pressed = 0
    for (let i = 0; i < 6; i++) {
      const more = await h.evaluate((row) => {
        const list = window.__placeList()
        const kept = row && list?.querySelector(`[data-id="${CSS.escape(row)}"]`)
        const all = [...(list?.querySelectorAll('[data-island-more]') ?? [])].filter((one) => /show/i.test(one.textContent) && !/fewer/i.test(one.textContent))
        const above = all.find((one) => !kept || (one.compareDocumentPosition(kept) & Node.DOCUMENT_POSITION_FOLLOWING))
        if (!above) return null
        above.scrollIntoView({ block: 'center' })
        const r = above.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }, left.row)
      if (!more) break
      await h.mouse.click(more.x, more.y)
      pressed++
      await wait(700)
    }
    console.log(`pressed ${pressed} "Show more" above the kept row in the other tab`)
    check('set up: something above the kept row grew in the other tab', pressed > 0)
    await h.click(`[data-tab="${(await tabs())[0].key}"] [role="tab"]`)
    await film('back')
    await wait(1000)
    const back = await place()
    console.log(`left: ${show(left)}\nback: ${show(back)}`)
    check('the first tab: the same row at the top of its list, though its list grew above it', same(left, back), `left ${show(left)}; back ${show(back)}`)
  }
  if (CASE === 'back') {
    await inbox()
    const { left } = await scrollNow(900)
    await h.evaluate(() => { const list = window.__placeList(); const edge = list.getBoundingClientRect(); [...list.querySelectorAll('[data-id]')].find((one) => one.getBoundingClientRect().top > edge.top + 120)?.click() })
    await wait(1500)
    await h.keyboard.press('Meta+BracketLeft')
    await film('back')
    await wait(1000)
    const back = await place()
    await h.keyboard.press('Meta+BracketRight')
    await wait(1500)
    await h.keyboard.press('Meta+BracketLeft')
    await wait(1500)
    const again = await place()
    console.log(`left: ${show(left)}\n⌘[: ${show(back)}\n⌘] ⌘[: ${show(again)}`)
    check('⌘[ back to the Inbox: the list where it was left', same(left, back), `left ${show(left)}; back ${show(back)}`)
    check('⌘] then ⌘[: the list where it was left', same(left, again), `left ${show(left)}; again ${show(again)}`)
  }
  if (CASE === 'section') {
    await inbox()
    const { left } = await scrollNow(900)
    await side('Home')
    await side('Inbox')
    await wait(800)
    const again = await place()
    console.log(`left: ${show(left)}\nInbox again from the sidebar: ${show(again)}`)
    // A new visit is a new step (Back is the way to the place left): said, not judged here.
    check('the Inbox from the sidebar again: its list drawn, the same list', !!again && Math.abs(again.tall - left.tall) <= 80, `left ${show(left)}; again ${show(again)}`)
  }
  if (CASE === 'resize') {
    await inbox()
    const { left } = await scrollNow(900)
    await frame('left')
    const boxOf = () => h.evaluate(() => { const r = window.__placeList().getBoundingClientRect(); return `${Math.round(r.top)}..${Math.round(r.bottom)}` })
    const boxLeft = await boxOf()
    await c.size(700, 760)
    await wait(800)
    const narrow = await place()
    await frame('narrow')
    await c.size(1100, 760)
    await wait(1200)
    const back = await place()
    await frame('wide')
    console.log(`the list's box: ${boxLeft} at first, ${await boxOf()} wide again`)
    console.log(`left: ${show(left)}\nnarrow: ${show(narrow)}\nwide again: ${show(back)}`)
    check('the window made narrow: the same row at the list\'s top', !!narrow && narrow.row === left.row, `left ${show(left)}; narrow ${show(narrow)}`)
    check('and wide again: the list where it was left', same(left, back), `left ${show(left)}; back ${show(back)}`)
  }
  if (CASE === 'pages') {
    const pages = [
      ['Home', () => c.send('view', 'home')],
      ['Gems', () => c.send('view', 'nuggets')],
      ['Questions', () => c.send('view', 'questions')],
      ['All tasks', () => c.send('view', 'alltasks')],
      ['Calendar', () => c.send('view', 'calendar')],
      // Writing's fullest folder, by its row in the sidebar (its folders shown first).
      ['a Writing folder', async () => {
        await c.send('view', 'articles')
        await wait(600)
        await h.evaluate(() => document.querySelector('[data-folders-fold="article"][aria-expanded="false"]')?.click())
        await wait(400)
        await h.evaluate(() => [...document.querySelectorAll('[data-side-folders="article"] [data-side-folder]')].sort((a, b) => (parseInt(b.textContent.replace(/\D+/g, ' ').trim().split(' ').pop()) || 0) - (parseInt(a.textContent.replace(/\D+/g, ' ').trim().split(' ').pop()) || 0))[0]?.click())
      }],
      // Files' own table (its All shelf as a table is its List view's sibling): the page with Files' longest list.
      ['Files', () => c.send('view', 'media')]
    ]
    for (const [name, go] of pages) {
      // Each page in a window of its own tabs: one tab, then the case.
      await h.evaluate(() => localStorage.removeItem('split'))
      await go()
      await wait(400)
      const reach = await h.evaluate(() => { const list = window.__placeList(); return list ? list.scrollHeight - list.clientHeight : 0 }).catch(() => 0)
      if (reach < 100) { console.log(`${name}: no list long enough to scroll (${reach} px): left out`); continue }
      const { left } = await scrollNow(900)
      const back = await awayAndBack()
      console.log(`${name}: left ${show(left)}; back ${show(back)}`)
      check(`${name}: the list where it was left, after another tab`, same(left, back), `left ${show(left)}; back ${show(back)}`)
      // The second tab closed, for the next page.
      const extra = (await tabs()).slice(1)
      for (const one of extra) await h.evaluate((key) => document.querySelector(`[data-tab="${key}"] [aria-label^="Close"]`)?.click(), one.key)
      await wait(600)
    }
  }
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
