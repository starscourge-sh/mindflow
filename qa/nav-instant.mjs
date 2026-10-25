// Going somewhere is instant, the way Finder and Mail are. On a big book
// (qa/big-book.mjs), every frame from the click or key is written down: the
// sidebar, each page and how faded it is, the note open and its words. For
// every route to a note (a link from another window, an @ link in a note, its
// hover card, which Review's "From" opens by too, ⌘K, a tag's page, Home's
// cards, Pinned, Recent, the stepper's ↑ ↓, ⌘[ and ⌘]) and back and forward on every kind of
// page (tasks, the calendar, a tag, a day's page):
//   - the sidebar is there, whole, on every frame
//   - the note open is the one asked for within 2 frames, and no other note is
//     open beside it in its place
//   - its words follow within 150ms
//   - no frame has an empty page
//   - from the keyboard, two pages never show over each other longer than 80ms
//   QA_DATA=<folder kept between runs> QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/nav-instant.mjs
// The same against a dev server: ELECTRON_RENDERER_URL=http://localhost:<port> with the same entry.
// ROUTES=back,cmdk runs only those (LISTS=Goals,Today: only those of `lists`). SLOW=<ms> makes every read that long, the way a busy big book answers.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { seedBig, seeded } from './big-book.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const DATA = process.env.QA_DATA
if (!DATA) throw new Error('QA_DATA is needed: the big book is written into it once and kept')
if (!seeded(DATA)) console.log('seeded', JSON.stringify(await seedBig(DATA)))

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, send, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
const ONLY = process.env.ROUTES?.split(',')
const BODY_MS = 150
const SHOTS = process.env.SHOTS
/** A picture of where it stands, when SHOTS names a folder: for a route that could not start. */
const shot = async (name) => SHOTS && (await h.screenshot({ path: `${SHOTS}/${name}.png` }))

/** Writes down each frame from now until `ms` later, and the moment of the click or key that starts it. */
const record = (ms = 1500) => h.evaluate((ms) => {
  const frames = []
  window.__nav = { frames, t: null }
  const at = (event) => void (window.__nav.t ??= event.timeStamp)
  window.addEventListener('keydown', at, { capture: true, once: true })
  window.addEventListener('pointerdown', at, { capture: true, once: true })
  const start = performance.now()
  const tick = () => {
    const side = document.querySelector('aside[data-chrome][data-book-tint]')
    const box = side?.getBoundingClientRect()
    const pane = document.querySelector('[data-pane-front]') ?? document.querySelector('[data-pane]')
    // A page held unseen until its reads are in (lib/reads-in.tsx) shows nothing: only its seen words count.
    const seen = (page) => page.textContent.length - [...page.querySelectorAll('[style*="visibility: hidden"]')].filter((one) => !one.parentElement.closest('[style*="visibility: hidden"]')).reduce((sum, one) => sum + one.textContent.length, 0)
    const pages = [...(pane?.querySelectorAll('[data-page]') ?? [])].map((one) => ({ id: one.getAttribute('data-page'), o: +getComputedStyle(one).opacity, text: !one.checkVisibility({ visibilityProperty: true }) ? 0 : seen(one) }))
    const notes = [...(pane?.querySelectorAll('.note-pane[data-open]') ?? [])].filter((one) => +getComputedStyle(one.closest('[data-page]') ?? one).opacity > 0.05 && one.checkVisibility({ visibilityProperty: true })).map((one) => ({ id: one.getAttribute('data-open'), words: one.querySelector('.ProseMirror')?.textContent.length ?? 0, coming: one.hasAttribute('data-coming') }))
    frames.push({ at: performance.now(), side: !!side && box.width > 0 && side.textContent.length > 20, pages, notes, text: pane?.textContent.length ?? 0 })
    if (performance.now() - start < ms) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}, ms)
const frames = async (ms = 1700) => { await wait(ms); return h.evaluate(() => window.__nav) }
/** Marks the start by hand, for a route the page itself starts (a link from another window). */
const mark = () => h.evaluate(() => void (window.__nav.t = performance.now()))

/**
 * The checks for one route. `target`: the note it opens (or a function of the
 * last frame that says whether the page is where it should be); `keyed`: it
 * came from the keyboard.
 */
function judge(name, run, { target, keyed = false, words = true, page, cold = false, within }) {
  const t = run.t
  if (t == null) return check(`${name}: started`, false, 'no click or key was seen')
  const after = run.frames.filter((one) => one.at > t)
  // DEBUG=1: every frame that differs from the one before, for reading what happened.
  if (process.env.DEBUG) console.log(`  ${name}\n` + after.map((one) => `    +${Math.round(one.at - t)} ${one.pages.map((page) => `${page.id}@${page.o.toFixed(2)}`).join(' ')} ${one.notes.map((note) => `${note.id.slice(0, 6)}${note.coming ? '…' : ''}:${note.words}`).join(' ')}`).filter((line, i, all) => i === 0 || line.replace(/\+\d+ /, '') !== all[i - 1].replace(/\+\d+ /, '')).join('\n'))
  const sideAll = run.frames.every((one) => one.side)
  check(`${name}: the sidebar is there on every frame`, sideAll, `${run.frames.filter((one) => !one.side).length} of ${run.frames.length} without it`)
  const empty = after.filter((one) => !one.pages.some((page) => page.o > 0.5 && page.text > 30))
  check(`${name}: no frame has an empty page`, !empty.length, empty.length ? `first at +${Math.round(empty[0].at - t)}ms: ${JSON.stringify(empty[0].pages)}` : '')
  const reached = typeof target === 'function' ? (one) => target(one) : (one) => one.notes.some((note) => note.id === target) && one.notes.every((note) => note.id === target)
  const at = after.findIndex(reached)
  const said = at < 0 ? 'never' : `frame ${at + 1}, +${Math.round(after[at].at - t)}ms`
  const before = JSON.stringify(after.slice(0, Math.max(0, at)).map((one) => one.notes.map((note) => note.id.slice(0, 6) + (note.coming ? '…' : '')).join('+') || one.pages.map((page) => page.id).join('+')).slice(-4))
  // A note never read before is read first, the page waiting for it; anything read before is there at once.
  if (!cold) check(`${name}: there within 2 frames`, at >= 0 && at < 2, `${said}; the last before it: ${before}`)
  else check(`${name}: there once read`, at >= 0, `${said}; the last before it: ${before}`)
  // Shown within this long of the ask, read or not: for one with no words to wait for (a task with no notes).
  if (within) check(`${name}: open within ${within}ms`, at >= 0 && after[at].at - t <= within, said)
  if (page) {
    // The page it lives on never shows without it: the note is there on the page's first frame.
    const shown = after.findIndex((one) => one.pages.some((one) => one.id === page && one.o > 0.05 && one.text > 0))
    check(`${name}: on the page's first frame`, shown >= 0 && shown >= at, shown < 0 ? 'the page never showed' : `page at frame ${shown + 1}, note at frame ${at + 1}`)
  }
  if (words && typeof target === 'string') {
    const read = after.find((one) => one.notes.some((note) => note.id === target && note.words > 0))
    check(`${name}: its words within ${BODY_MS}ms`, read && read.at - t <= BODY_MS, read ? `+${Math.round(read.at - t)}ms` : 'never')
  }
  if (keyed) {
    const both = after.filter((one) => one.pages.filter((page) => page.o > 0.05 && page.text > 0).length > 1)
    const long = both.length ? both.at(-1).at - both[0].at : 0
    check(`${name}: no two pages over each other past 80ms`, long <= 80, `${Math.round(long)}ms`)
  }
}
const want = (name) => !ONLY || ONLY.includes(name)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await wait(1500)
  if (process.env.SLOW) await electron.evaluate(({ ipcMain }, ms) => {
    for (const name of [...ipcMain._invokeHandlers.keys()].filter((one) => one.startsWith('haligtree:') || one.startsWith('captures:'))) {
      const was = ipcMain._invokeHandlers.get(name)
      ipcMain.removeHandler(name)
      ipcMain.handle(name, async (...args) => { await new Promise((ok) => setTimeout(ok, ms)); return was(...args) })
    }
  }, +process.env.SLOW)
  const writing = await v('items', 'article')
  const florence = writing.find((one) => one.title === 'How Florence learned perspective')
  const other = writing.find((one) => one.title.startsWith('Big writing'))
  const blur = () => h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  const front = () => h.evaluate(() => (document.querySelector('[data-pane-front]') ?? document.querySelector('[data-pane]'))?.querySelector('[data-page]')?.getAttribute('data-page'))
  const openNote = () => h.evaluate(() => document.querySelector('.note-pane[data-open]:not([data-coming])')?.getAttribute('data-open'))

  // A link from somewhere else (another window, a notification, quick capture's Open): Today to a Writing note.
  if (want('link')) {
    await send('view', 'today'); await wait(1200)
    await record(); await mark(); await h.evaluate((id) => window.api.openInHome('article', id), florence.id)
    judge('a link from Today to Writing, never read before', await frames(), { target: florence.id, page: 'articles', cold: true })
    await send('view', 'today'); await wait(1200)
    await record(); await mark(); await h.evaluate((id) => window.api.openInHome('article', id), florence.id)
    judge('the same link again', await frames(), { target: florence.id, page: 'articles' })
  }
  // The same cold link to every other page that lists notes beside the one open (Pages and Gems
  // have theirs above and on Home): the one sent for never waits for its whole list (Page's `apart`).
  if (want('lists')) {
    // One with words of its own, so there are words to wait for.
    const worded = async (list) => { for (const one of list) if (JSON.stringify((await v('item', one.id))?.body ?? '').includes('"text":')) return one }
    const question = await worded((await v('items', 'question')).filter((one) => !one.closedAt && !one.archivedAt))
    const goal = (await v('items', 'goal')).find((one) => !one.closedAt && !one.archivedAt)
    const capture = (await h.evaluate(() => window.api.captures.list())).find((one) => one.status === 'open' && !one.archivedAt && one.kind !== 'todo')
    const task = (await v('tasks')).find((one) => one.status === 'open' && !one.recurrence && /^Big task/.test(one.title) && one.dueAt)
    for (const [label, type, one, page, words] of [['Questions', 'question', question, 'questions', true], ['Goals', 'goal', goal, 'goals', false], ['Inbox', 'capture', capture, 'inbox', true], ['Today', 'task', task, 'today', false]]) {
      if (process.env.LISTS && !process.env.LISTS.split(',').includes(label)) continue
      if (!one) { check(`a link from Home to ${label}: found one to open`, false); continue }
      await send('view', 'home'); await wait(1200)
      await record(); await mark(); await h.evaluate(([type, id]) => window.api.openInHome(type, id), [type, one.id])
      judge(`a link from Home to ${label}, never read before`, await frames(), { target: one.id, page, cold: true, words, within: words ? undefined : BODY_MS })
    }
  }
  // Back and Forward between two Writing notes, both read already.
  if (want('back')) {
    await send('article', florence.id); await wait(1200)
    await send('article', other.id); await wait(1200)
    await blur()
    await record(); await h.keyboard.press('Meta+BracketLeft')
    judge('⌘[ between two Writing notes', await frames(), { target: florence.id, keyed: true })
    await record(); await h.keyboard.press('Meta+BracketRight')
    judge('⌘] between two Writing notes', await frames(), { target: other.id, keyed: true })
    await record(); await h.keyboard.press('Meta+BracketLeft')
    judge('⌘[ again', await frames(), { target: florence.id, keyed: true })
  }
  // An @ link inside a note, and the hover card over one.
  if (want('atlink')) {
    const asks = (await v('items', 'question')).find((one) => one.title?.startsWith('Why did linear perspective'))
    await send('question', asks.id); await wait(1500)
    const link = h.locator(`a.tiptap-note-link[data-note="article:${florence.id}"]`).first()
    if (await link.count()) {
      await link.scrollIntoViewIfNeeded()
      await record(); await link.click()
      judge('an @ link in a note', await frames(), { target: florence.id })
    } else (await shot('atlink'), check('an @ link in a note: found the link', false))
    await send('question', asks.id); await wait(1500)
    const again = h.locator(`a.tiptap-note-link[data-note="article:${florence.id}"]`).first()
    if (await again.count()) {
      await again.hover(); await h.mouse.move(5, 5); await again.hover(); await wait(1200)
      // Its card opens the note by its link; the card's own way to a note is "Open beside", a pane of its own.
      const beside = h.locator('[data-note-preview] [data-open-beside]').first()
      if (await beside.count()) {
        await record(); await beside.click()
        judge('an @ link\'s hover card, “Open beside”', await frames(), { target: florence.id })
        await h.mouse.move(5, 5); await blur(); await h.keyboard.press('Control+w'); await wait(800)
      } else (await shot('hover'), check('the hover card shows', false))
    }
  }
  // ⌘K: its name typed, Enter.
  if (want('cmdk')) {
    await send('view', 'home'); await wait(1200); await blur()
    await h.keyboard.press('Meta+k'); await wait(700)
    await h.keyboard.type('Florence learned perspective'); await wait(900)
    // Down to the piece of writing itself (a task named after it comes first).
    for (let i = 0; i < 6; i++) {
      const lit = await h.evaluate(() => document.querySelector('[data-search-at]')?.getAttribute('data-drag-open') ?? '')
      if (lit === `article:${florence.id}`) break
      await h.keyboard.press('ArrowDown'); await wait(150)
    }
    await shot('cmdk')
    await record(); await h.keyboard.press('Enter')
    judge('⌘K', await frames(), { target: florence.id, keyed: true })
  }
  // A tag's page, one of its rows.
  if (want('tag')) {
    await send('view', 'today'); await wait(600)
    const tagWord = JSON.stringify((await v('item', florence.id)).body).match(/#([a-z][\w-]*)/i)?.[1] ?? 'renaissance'
    await h.evaluate((tag) => window.api.openInHome('tag', tag), tagWord); await wait(1800)
    // As a list, its rows to click (Stream reads them whole).
    const list = h.locator('[data-page=tags] button:has-text("List")').first()
    if (await list.count()) { await list.click(); await wait(800) }
    const row = h.locator('[data-page=tags]').getByText('How Florence learned perspective', { exact: true }).first()
    if (await row.count()) {
      await row.scrollIntoViewIfNeeded()
      await record(); await row.click()
      judge('a row on a tag\'s page', await frames(), { target: florence.id })
    } else (await shot('tag'), check('a row on a tag\'s page: found it', false))
  }
  // Home's cards.
  if (want('home')) {
    await send('view', 'home'); await wait(1800)
    const card = h.locator('[data-page=home] [data-drag-open^="article:"], [data-page=home] [data-drag-open^="nugget:"]').first()
    if (await card.count()) {
      const [type, id] = (await card.getAttribute('data-drag-open')).split(':')
      await card.scrollIntoViewIfNeeded()
      await record(); await card.click()
      judge(`a ${type === 'article' ? 'page' : 'gem'}'s card on Home`, await frames(), { target: id })
    } else check('a note\'s card on Home: found one', false)
  }
  // Pinned, in the sidebar.
  if (want('pinned')) {
    await v('pin', 'nuggets', florence.id, true); await send('view', 'today'); await wait(1500)
    const pin = h.locator(`aside [data-drag-open="article:${florence.id}"]`).first()
    if (await pin.count()) {
      await record(); await pin.click()
      judge('a pin in the sidebar', await frames(), { target: florence.id })
    } else check('a pin in the sidebar: found it', false)
    await v('pin', 'nuggets', florence.id, false)
  }
  // Recent, beside the page (⇧⌘Y).
  if (want('recent')) {
    await send('view', 'today'); await wait(1200); await blur()
    await h.keyboard.press('Meta+Shift+y'); await wait(1200)
    // Its first note (not a task), in the panel beside the page.
    const to = await h.evaluate(() => {
      const one = [...document.querySelectorAll('[data-recent-row][data-drag-open]')].find((el) => /^(article|nugget|capture|question):/.test(el.getAttribute('data-drag-open')))
      one?.setAttribute('data-nav-probe', '')
      return one?.getAttribute('data-drag-open').split(':')[1]
    })
    const row = h.locator('[data-nav-probe]')
    if (to) {
      await record(); await row.click()
      judge('a row in Recent', await frames(), { target: to })
    } else (await shot('recent'), check('a row in Recent: found it', false))
    await blur(); await h.keyboard.press('Meta+Shift+y'); await wait(500)
  }
  // The stepper's ↓ and ↑, Writing's list beside the note.
  if (want('stepper')) {
    await send('article', florence.id); await wait(1500); await blur()
    for (const key of ['ArrowDown', 'ArrowUp', 'ArrowDown']) {
      const was = await openNote()
      await record(); await h.keyboard.press(key)
      const run = await frames()
      const to = await openNote()
      check(`${key === 'ArrowDown' ? '↓' : '↑'}: moved on`, to && to !== was, `${was?.slice(0, 6)} → ${to?.slice(0, 6)}`)
      // Writing holds questions too; a question asked with nothing written under it yet has no words to wait for.
      const bare = to && (await v('item', to))?.tier === 'question' && !(await h.evaluate(() => document.querySelector('.note-pane[data-open] .ProseMirror')?.textContent.length))
      judge(`the stepper's ${key === 'ArrowDown' ? '↓' : '↑'}`, run, { target: to, keyed: true, words: !bare })
    }
  }
  // Back and forward on every other kind of page: a task, the calendar, a tag, a day.
  if (want('pages')) {
    const tasks = (await v('tasks')).filter((one) => one.status === 'open').slice(0, 2)
    await send('task', tasks[0].id); await wait(1500)
    await send('task', tasks[1].id); await wait(1500); await blur()
    await record(); await h.keyboard.press('Meta+BracketLeft')
    judge('⌘[ between two tasks', await frames(), { target: tasks[0].id, keyed: true, words: false })
    await record(); await h.keyboard.press('Meta+BracketRight')
    judge('⌘] between two tasks', await frames(), { target: tasks[1].id, keyed: true, words: false })
    const day = (offset) => { const at = new Date(Date.now() + offset * 86400000); return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}` }
    const shows = (page) => (one) => { const on = one.pages.filter((it) => it.o > 0.5 && it.text > 0); return on.length === 1 && on[0].id === page }
    for (const [label, a, b, page] of [['a day\'s page', ['day', day(-1)], ['day', day(-2)], 'day'], ['a tag', ['tag', 'renaissance'], ['tag', 'perspective'], 'tags'], ['the calendar', ['view', 'calendar'], ['view', 'today'], null]]) {
      await h.evaluate(([type, id]) => window.api.openInHome(type, id), a); await wait(1500)
      await h.evaluate(([type, id]) => window.api.openInHome(type, id), b); await wait(1500); await blur()
      const before = await front()
      await record(); await h.keyboard.press('Meta+BracketLeft')
      const run = await frames()
      const there = await front()
      judge(`⌘[ from ${label}`, run, { target: shows(page ?? there), keyed: true, words: false })
      await record(); await h.keyboard.press('Meta+BracketRight')
      judge(`⌘] to ${label}`, await frames(), { target: shows(before), keyed: true, words: false })
    }
  }
  const errors = c.errors.filter((one) => !/403|Failed to load resource/.test(one))
  check('no errors on the page', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
