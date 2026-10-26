// “Show in list” on the open note, as Finder's “Show in Enclosing Folder”:
// its row, scrolled far out of a long list (not even drawn), comes into the
// middle of view and is lit once (mf-arrive). In the Inbox, Writing, Gems and
// Tasks, from the note's ⋯ menu (Tasks: its “Show in list” line), by ⌥⌘L, and
// from the note's right-click menu. Then: a filter that hides the open note is
// cleared with a notice and Undo; and a note open in its own window goes back
// to its own list in the main window, on its row.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-b/main/index.js HALIGTREE_QA_AWAY=1 node qa/show-in-list.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const ROW = (P, id) => `${P} [data-row][data-id="${id}"], ${P} [data-task-row][data-id="${id}"]`
// Where the open one's row is: inside its scrolling box, near its middle, lit.
const look = (P, id) => h.evaluate(([P, id, sel]) => {
  const row = document.querySelector(sel)
  if (!row) return { drawn: false }
  let box = row.parentElement
  while (box && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  const r = row.getBoundingClientRect(), b = (box ?? document.documentElement).getBoundingClientRect()
  // Near the middle, or as near as it goes: a row at the list's top cannot come further down.
  const atTop = !box || box.scrollTop < 2
  return { drawn: true, inView: r.top >= b.top - 1 && r.bottom <= b.bottom + 1, middle: atTop || Math.abs((r.top + r.bottom) / 2 - (b.top + b.bottom) / 2) < b.height / 4, lit: !!row.closest('.mf-arrive') || !!row.querySelector('.mf-arrive') }
}, [P, id, ROW(P, id)])
// The list's own scroller to its far end, so the open row is out of view (a long list then does not draw it).
const scrollAway = (P) => h.evaluate((P) => {
  const row = document.querySelector(`${P} [data-row], ${P} [data-task-row]`)
  let box = row?.parentElement
  while (box && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement
  if (box) box.scrollTop = box.scrollHeight
}, P)
const blur = () => h.evaluate(() => document.activeElement?.blur?.())
const menuLine = (text) => h.locator('[role=menu] [role=menuitem], [role=menu] button').filter({ hasText: text }).first()
// Lit is caught as it happens: the flash lasts about a second.
const watchLit = (P, id) => h.evaluate(([P, sel]) => {
  window.__lit = false
  const seen = new MutationObserver(() => { const row = document.querySelector(sel); if (row && (row.closest('.mf-arrive') || row.querySelector('.mf-arrive'))) window.__lit = true })
  seen.observe(document.querySelector(P), { subtree: true, attributes: true, attributeFilter: ['class'], childList: true })
  setTimeout(() => seen.disconnect(), 3000)
}, [P, ROW(P, id)])

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false })
  await v('onboarding:set', { pageHints: false })
  for (let n = 0; n < 60; n++) await h.evaluate((b) => window.api.captures.create({ kind: 'todo', body: b }), `wrenfield thought number ${n}`)
  for (let n = 0; n < 40; n++) await h.evaluate((n) => window.api.haligtree('nugget:from', `wrenfield gem number ${n}`, {}), n)
  for (let n = 0; n < 40; n++) await v('article:new')
  for (let n = 0; n < 50; n++) await h.evaluate((n) => window.api.haligtree('task:add', `wrenfield task ${n}`), n).catch(() => {})

  for (const [name, page] of [['Inbox', 'inbox'], ['Writing', 'articles'], ['Gems', 'nuggets'], ['Tasks', 'upcoming']]) {
    const P = `[data-page="${page}"]`
    await go(page); await wait(1200)
    const id = await h.evaluate((P) => document.querySelector(`${P} [data-row][data-id], ${P} [data-task-row][data-id]`)?.dataset.id, P)
    if (!id) { check(`${name}: has rows`, false); continue }
    await h.locator(ROW(P, id)).first().click({ position: { x: 60, y: 10 } }); await wait(1000)
    for (const how of ['menu', '⌥⌘L', 'right-click']) {
      if (how === 'right-click' && name === 'Tasks') continue
      await scrollAway(P); await wait(500)
      const before = await look(P, id)
      await watchLit(P, id)
      if (how === '⌥⌘L') { await blur(); await h.keyboard.press('Meta+Alt+KeyL') }
      else if (how === 'menu' && name === 'Tasks') await h.locator(`${P} .note-pane button, ${P} .note-pane [role=button]`).filter({ hasText: /^Show in list/ }).first().click()
      else if (how === 'menu') {
        await h.locator(`${P} .note-pane button[aria-label="More"]`).first().click(); await wait(400)
        const line = menuLine(/^Show in list/)
        check(`${name}: the ⋯ menu has “Show in list”`, (await line.count()) > 0)
        await line.click()
      } else {
        const words = h.locator(`${P} .note-pane .tiptap[contenteditable=true] > :is(p, h1, h2, h3)`).first()
        // A new page has no words yet, and an empty line has no menu: a few typed first.
        if (name === 'Writing') { await words.click(); await h.keyboard.type('A page of wrenfield words'); await wait(400) }
        await h.locator(`${P} .note-pane .tiptap[contenteditable=true] :is(p, h1, h2, h3)`).filter({ hasText: /\w/ }).first().click({ button: 'right', position: { x: 12, y: 8 } }); await wait(600)
        const line = h.locator('[data-show-in-list]').first()
        check(`${name}: the note's right-click menu has “Show in list”`, (await line.count()) > 0, await h.evaluate(() => [...document.querySelectorAll('[role=menu]')].map((one) => one.textContent.slice(0, 80)).join(' | ')))
        if (!(await line.count())) { await h.keyboard.press('Escape'); continue }
        await line.click()
      }
      await wait(1100)
      const s = await look(P, id)
      check(`${name}, ${how}: scrolled away first, its row was out of view`, !before.drawn || !before.inView, JSON.stringify(before))
      check(`${name}, ${how}: its row is in view, near the middle, and lit once`, s.drawn && s.inView && s.middle && (await h.evaluate(() => window.__lit)), JSON.stringify(s))
    }
  }

  // A filter that hides the open one: cleared, said, and Undo puts it back.
  {
    const P = '[data-page="inbox"]'
    await go('inbox'); await wait(900)
    const id = await h.evaluate((P) => document.querySelector(`${P} [data-row][data-id]`)?.dataset.id, P)
    await h.locator(ROW(P, id)).first().click({ position: { x: 60, y: 10 } }); await wait(900)
    // Only quotes on show: the open to-do is hidden from the list.
    await h.evaluate(() => { const key = Object.keys(localStorage).find((one) => /^view:.*inbox/i.test(one)); const was = key ? JSON.parse(localStorage.getItem(key)) : {}; window.__key = key })
    const chip = h.locator(`${P} [data-filter-chip], ${P} button[aria-pressed]`).filter({ hasText: /^Quotes?$/ }).first()
    if (await chip.count()) {
      await chip.click(); await wait(700)
      const hidden = !(await look(P, id)).drawn
      await blur(); await h.keyboard.press('Meta+Alt+KeyL'); await wait(1200)
      const s = await look(P, id)
      const said = await h.evaluate(() => [...document.querySelectorAll('[role=status][aria-live]')].map((one) => one.textContent).join(' | '))
      check('a filter hid the open note', hidden)
      check('Show in list clears it, the row in view', s.drawn && s.inView, JSON.stringify(s))
      check('and says so, with Undo', /Filters cleared/.test(said) && /Undo/.test(said), said)
    } else check('the Inbox has a Quotes chip to filter by', false)
  }

  // Open in its own window: “Show in list” goes back to its own list in the main window, on its row.
  {
    const P = '[data-page="inbox"]'
    await go('inbox'); await wait(900)
    const id = await h.evaluate((P) => document.querySelector(`${P} [data-row][data-id]`)?.dataset.id, P)
    await h.locator(ROW(P, id)).first().click({ position: { x: 60, y: 10 } }); await wait(900)
    const opened = c.electron.waitForEvent('window', { timeout: 8000 })
    await h.locator(`${P} [data-open-apart]`).first().click()
    const note = await opened.catch(() => null)
    if (!note) check('a note opens in its own window', false)
    else {
      await note.waitForLoadState(); await note.waitForTimeout(1500)
      await go('articles'); await wait(800)
      await note.locator('button[aria-label="More"]').first().click(); await note.waitForTimeout(400)
      await note.locator('[role=menu] [role=menuitem]').filter({ hasText: /^Show in list/ }).first().click()
      await wait(1500)
      const page = await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page'))
      const s = await look(P, id)
      check('from its own window: the main window is on the Inbox', page === 'inbox', page)
      check('with its row in view', s.drawn && s.inView, JSON.stringify(s))
      await note.close().catch(() => {})
    }
  }
} finally {
  await c.close()
}
done()
