// Whatever opens beside a list, from any route, the list shows its row, as
// Finder's "Show in Enclosing Folder" does: its island unfolded and opened
// past "Show more" (no sound of its own), scrolled into view, marked as the
// open one, with the keyboard on it so ↓ goes on from there. Each route opens
// a row that starts hidden (in a folded island, or far down a long list).
// Checks for each: the row is drawn and inside the list's visible box, it has
// the open mark, ↓ moves to the row after it, and at most one sound played.
// Also: Undo after ⌫ brings the note back open on its row, a new article
// shows in Writing, a cleared search finds the one looked at, quick
// capture's list does the same, and the sidebar marks the page and the
// pinned note open.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/open-shows-row.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
// The sounds heard are emptied before each route (the list keeps only its last fifty), so what follows is the route's alone.
const heard = () => h.evaluate(() => ((window.haligtreeHeard ?? []).length = 0))
const said = () => h.evaluate(() => [...(window.haligtreeHeard ?? [])])

// Where the row is: drawn, inside the box that scrolls it, marked open, the keyboard on it.
const look = (page, id) => h.evaluate(([page, id]) => {
  const scope = document.querySelector(`[data-page="${page}"]`) ?? document
  const row = scope.querySelector(`[data-row][data-id="${CSS.escape(id)}"], [data-task-row][data-id="${CSS.escape(id)}"]`)
  if (!row) return { drawn: false }
  let box = row.parentElement
  while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  const at = row.getBoundingClientRect()
  const view = box?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight }
  return { rect: `${Math.round(at.top)}-${Math.round(at.bottom)} in ${Math.round(view.top)}-${Math.round(view.bottom)}`, drawn: true, inView: at.height > 0 && at.top >= view.top - 1 && at.bottom <= view.bottom + 1, open: row.hasAttribute('data-open'), cursor: row.hasAttribute('data-cursor') }
}, [page, id])
// The row after it in the list, as drawn.
const nextOf = (page, id) => h.evaluate(([page, id]) => {
  const rows = [...document.querySelectorAll(`[data-page="${page}"] [data-row][data-id], [data-page="${page}"] [data-task-row][data-id]`)].map((one) => one.dataset.id)
  return rows[rows.indexOf(id) + 1] ?? null
}, [page, id])
const cursorId = (page) => h.evaluate((page) => document.querySelector(`[data-page="${page}"] [data-cursor]`)?.dataset.id ?? null, page)
const drawn = (page, id) => h.evaluate(([page, id]) => !!document.querySelector(`[data-page="${page}"] [data-id="${CSS.escape(id)}"][data-row]`), [page, id])

// The whole check for one route: `route` opens `id` on `page`; `hidden` says it began out of sight.
async function shows(name, page, id, route, { keys = true, ready } = {}) {
  // What comes before the route itself (⌘K's own panel opening) is not counted.
  if (ready) await ready()
  const before = await heard()
  await route()
  let seen = { drawn: false }
  for (let i = 0; i < 20 && !(seen.drawn && seen.inView && seen.open); i++) (await wait(150), (seen = await look(page, id)))
  await wait(300)
  const sounds = (await said()).slice(before)
  check(`${name}: the row is drawn`, seen.drawn)
  check(`${name}: and in the list's visible box`, seen.inView, seen.rect)
  check(`${name}: marked as the open one`, seen.open)
  check(`${name}: the keyboard is on it`, seen.cursor)
  check(`${name}: one sound at most`, sounds.length <= 1, sounds.join(', '))
  if (!keys) return
  const next = await nextOf(page, id)
  await h.evaluate(() => (document.activeElement)?.blur?.())
  await h.locator(`[data-page="${page}"] header`).first().click({ position: { x: 5, y: 5 } }).catch(() => {})
  await h.evaluate(() => (document.activeElement)?.blur?.())
  await h.keyboard.press('ArrowDown'); await wait(250)
  check(`${name}: ↓ moves on to the next row`, next && (await cursorId(page)) === next, `${await cursorId(page)} vs ${next}`)
}

// The note open beside the list, waited for (a step lands a moment after its key).
const paneOn = async (id, ms = 4000) => {
  for (let t = 0; t < ms; t += 100) {
    if ((await h.evaluate(() => document.querySelector('.note-pane')?.dataset.open)) === id) return true
    await wait(100)
  }
  return false
}
// ⌘K's panel, open and taking keys, before anything is typed into it.
const palette = async () => {
  await h.evaluate(() => (document.activeElement)?.blur?.())
  await h.keyboard.press('Meta+k')
  await h.waitForFunction(() => document.activeElement instanceof HTMLInputElement && /earch|Do something/.test(document.activeElement.placeholder), null, { timeout: 5000 })
}

// The Inbox's Note island folded, so every note in it starts out of sight.
async function foldNotes() {
  const head = h.locator('[data-page="inbox"] [data-island-head="Note"]')
  await head.waitFor({ timeout: 8000 })
  if ((await head.getAttribute('aria-expanded')) === 'true') (await head.click(), await wait(400))
}

try {
  await h.evaluate(() => Object.keys(localStorage).filter((k) => /^(view|islands):/.test(k)).forEach((k) => localStorage.removeItem(k)))
  // The Inbox groups by date to start; these routes are about its kind islands folded, a choice in Display.
  await h.evaluate(() => { for (const key of ['view:captures:Inbox', 'view:prompt:captures']) localStorage.setItem(key, JSON.stringify({ sort: 'newest', group: 'kind', filter: key === 'view:prompt:captures' ? { status: ['open'] } : {} })) })
  await h.reload(); await c.page.reload().catch(() => {}); await wait(1800)
  const caps = (await h.evaluate(() => window.api.captures.list())).filter((one) => one.kind === 'note' && one.status === 'open' && !one.archivedAt && !one.private)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))
  const titled = caps.filter((one) => one.label.trim().length > 12 && !one.label.includes('#'))
  const at = (share) => titled[Math.floor(titled.length * share)]
  const [A, B, C, D, E] = [at(0.3), at(0.45), at(0.6), at(0.75), at(0.9)]
  console.log(`${caps.length} open notes, ${titled.length} titled`)
  const tagged = caps.filter((one) => /#cooking\b/.test(one.label))[0] ?? caps.find((one) => one.label.includes('#'))
  const tag = /#([\w-]+)/.exec(tagged.label)[1]

  // 1. Sent here by the main process: a notification, the menu bar, quick capture's "Open in Haligtree".
  await go('inbox'); await wait(800)
  await foldNotes()
  check('starts hidden: the note is not drawn in the folded island', !(await drawn('inbox', A.id)))
  await shows('notification / menu bar / quick capture', 'inbox', A.id, () => send('capture', A.id))
  const side = await h.evaluate(() => document.querySelector('[data-side-row][aria-current="page"]')?.getAttribute('aria-label'))
  check('the sidebar marks the Inbox as the page you are on', side === 'Inbox', side)

  // 2. A tag page's link.
  await foldNotes()
  await send('tag', tag); await wait(1200)
  const marked = () => h.evaluate(() => document.querySelector('[data-side-row][aria-current="page"]')?.textContent?.trim())
  const tagsShown = await h.evaluate(() => document.querySelector('[aria-label="Fold the tags away"]') !== null)
  if (!tagsShown) {
    check('with your tags folded in the sidebar, "Tags" is marked', (await marked()) === 'Tags', await marked())
    await h.locator('[aria-label="Show your tags"]').first().click(); await wait(500)
  }
  check('with your tags showing, the tag is marked as the page you are on', (await marked())?.includes(tag), await marked())
  await shows('a tag page link', 'inbox', tagged.id, async () => {
    const row = h.locator(`[data-page="tags"] [data-pick="capture:${tagged.id}"]`).first()
    await row.waitFor({ timeout: 5000 })
    await row.click()
  })

  // 3. ⌘K.
  await foldNotes()
  await shows('⌘K', 'inbox', B.id, () => h.locator(`[data-drag-open="capture:${B.id}"]`).first().click(), {
    ready: async () => {
      await palette()
      await h.keyboard.type(B.label.slice(0, 30), { delay: 10 })
      await h.locator(`[data-drag-open="capture:${B.id}"]`).first().waitFor({ timeout: 5000 })
    }
  })

  // 4. The stepper's ↓ in the note's header, onto the next note while its island is folded again.
  await foldNotes()
  {
    const was = await h.evaluate(() => document.querySelector('.note-pane')?.dataset.open)
    const before = await heard()
    await h.locator('.note-pane button[aria-label="Next"]').first().click(); await wait(900)
    const now = await h.evaluate(() => document.querySelector('.note-pane')?.dataset.open)
    const sounds = (await said()).slice(before)
    const seen = await look('inbox', now)
    check('the stepper ↓ opened the next note', !!now && now !== was, `${was} → ${now}`)
    check('the stepper ↓: the row is drawn and in view', seen.drawn && seen.inView, JSON.stringify(seen))
    check('the stepper ↓: marked open, keyboard on it', seen.open && seen.cursor)
    check('the stepper ↓: one sound at most', sounds.length <= 1, sounds.join(', '))
  }

  // 5. Back and forward (⌘[ ⌘]): two notes opened, the island folded, then back to the first.
  await send('capture', C.id)
  check('C open', await paneOn(C.id))
  await send('capture', D.id)
  check('D open', await paneOn(D.id))
  await wait(600)
  await foldNotes()
  await shows('back (⌘[)', 'inbox', C.id, async () => {
    await h.evaluate(() => (document.activeElement)?.blur?.())
    await h.keyboard.press('Meta+BracketLeft')
  }, { keys: false })
  await foldNotes()
  await shows('forward (⌘])', 'inbox', D.id, async () => {
    await h.evaluate(() => (document.activeElement)?.blur?.())
    await h.keyboard.press('Meta+BracketRight')
  }, { keys: false })

  // 6. Pinned in the sidebar: the note opens with its row shown, and its pin is marked open.
  await v('pin', 'captures', E.id, true); await wait(800)
  await foldNotes()
  await shows('Pinned in the sidebar', 'inbox', E.id, async () => {
    const pin = h.locator(`[data-drag-open="capture:${E.id}"]`).first()
    await pin.waitFor({ timeout: 5000 })
    await pin.click()
  }, { keys: false })
  const pinMarked = await h.evaluate((id) => document.querySelector(`[data-drag-open="capture:${id}"]`)?.getAttribute('aria-current'), E.id)
  check('the pinned note is marked in the sidebar while it is open', pinMarked === 'true', pinMarked)

  // 7. ⌫ on the open note, then ⌘Z: it comes back open, on its row.
  await h.evaluate(() => (document.activeElement)?.blur?.())
  await h.locator('[data-page="inbox"] header').first().click({ position: { x: 5, y: 5 } }).catch(() => {})
  await h.waitForFunction((id) => document.querySelector('[data-page="inbox"] [data-cursor]')?.dataset.id === id && !document.activeElement?.closest('.ProseMirror'), E.id, { timeout: 4000 }).catch(() => {})
  await h.keyboard.press('Backspace')
  for (let t = 0; t < 3000 && (await h.evaluate(() => document.querySelector('.note-pane')?.dataset.open)) === E.id; t += 100) await wait(100)
  await wait(400)
  const moved = await h.evaluate(() => document.querySelector('.note-pane')?.dataset.open)
  check('⌫ moved the open note to the Bin and the pane on', moved !== E.id, moved)
  await h.evaluate(() => (document.activeElement)?.blur?.())
  await h.keyboard.press('Meta+z'); await wait(1600)
  const back = await look('inbox', E.id)
  const pane = await h.evaluate(() => document.querySelector('.note-pane')?.dataset.open)
  check('⌘Z: the note is open again', pane === E.id, pane)
  check('⌘Z: its row is drawn, in view and marked open', back.drawn && back.inView && back.open, JSON.stringify(back))
  await v('pin', 'captures', E.id, false)

  // 8. A gem far down Gems, sent here: its row scrolled into view.
  const gems = await v('items', 'nugget')
  await go('nuggets'); await wait(1000)
  const far = await h.evaluate(() => [...document.querySelectorAll('[data-page="nuggets"] [data-row][data-id]')].map((one) => one.dataset.id))
  const gem = gems.filter((one) => !one.archivedAt && !far.includes(one.id) && !one.private).at(-3)
  check('starts hidden: the gem is not drawn', !!gem && !(await drawn('nuggets', gem.id)))
  if (gem) await shows('Gems, far down', 'nuggets', gem.id, () => send('nugget', gem.id))

  // 9. A task due today, sent here (Home's cards, Today, notifications): Today, its row open.
  const tasks = await v('tasks')
  const today = tasks.find((one) => one.status === 'open' && !one.waitingOn && !one.recurrence && one.dueAt && new Date(one.dueAt) < new Date(new Date().setHours(24, 0, 0, 0)))
  if (today) {
    await go('home'); await wait(600)
    await shows('a task due today, from a link', 'today', today.id, () => h.evaluate((id) => window.api.openInHome('task', id), today.id), { keys: false })
  } else check('a task due today in the sandbox', false)

  // 10. "New page" in Pages: the new one is in the list, marked open.
  await go('articles'); await wait(1000)
  await h.getByRole('button', { name: 'New page' }).first().click(); await wait(1500)
  const made = await h.evaluate(() => document.querySelector('.note-pane')?.dataset.open)
  const fresh = made ? await look('articles', made) : { drawn: false }
  check('a new page shows in Pages, in view and marked open', fresh.drawn && fresh.inView && fresh.open, JSON.stringify(fresh))
  if (made) await v('bin:to', made).catch(() => {})

  // 11. A card on Home, onto a note whose island is folded.
  await go('inbox'); await wait(800)
  await foldNotes()
  await go('home'); await wait(1200)
  const card = await h.evaluate((ids) => [...document.querySelectorAll('[data-page="home"] [data-drag-open^="capture:"]')].map((one) => one.getAttribute('data-drag-open').slice(8)).find((id) => ids.includes(id)), caps.map((one) => one.id))
  if (card) await shows("a card on Home", 'inbox', card, () => h.locator(`[data-page="home"] [data-drag-open="capture:${card}"]`).first().click(), { keys: false })
  else check('a note card on Home in this sandbox', false)

  // 12. Writing: a note inside a folded group of your own, sent here.
  const arts = (await v('items', 'article')).filter((one) => !one.archivedAt && !one.private).map((one) => one.id)
  const gid = await h.evaluate(() => crypto.randomUUID())
  await v('groups:arrange', 'article', { top: [`g:${gid}`, ...arts.slice(2)], groups: { [gid]: arts.slice(0, 2) }, make: { id: gid, name: 'QA group' } })
  await v('groups:set', gid, { folded: true })
  await go('articles'); await wait(1200)
  check('starts hidden: the article is not drawn in its folded group', !(await drawn('articles', arts[1])))
  await shows('Writing, in a folded group', 'articles', arts[1], () => send('article', arts[1]), { keys: false })
  // The same as tiles: the group is one folder card, gone into for it.
  await go('home'); await wait(600)
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ density: 'grid' })))
  await h.reload(); await wait(1800)
  await go('articles'); await wait(1200)
  check('starts hidden: as tiles, the article is inside its folder card', !(await drawn('articles', arts[0])) && (await h.evaluate(() => !!document.querySelector('[data-page="articles"] [data-row][data-id^="g:"]'))))
  await shows('Writing as tiles, inside a folder card', 'articles', arts[0], () => send('article', arts[0]), { keys: false })
  await h.evaluate(() => localStorage.removeItem('view:article'))

  // 13. From the Calendar, ⌘K onto a task behind Unscheduled's "Show more": it opens in Upcoming, its row shown there.
  for (let n = 1; n <= 12; n++) await v('task:add', `QA loose ${n} plain`)
  await go('calendar'); await wait(1500)
  const loose = await h.evaluate(() => [...document.querySelectorAll('[data-cal-loose]')].map((one) => one.getAttribute('data-cal-loose')))
  const tasksNow = await v('tasks')
  const hiddenLoose = tasksNow.filter((one) => one.status === 'open' && !one.dueAt && !one.deadline && one.title.startsWith('QA loose') && !loose.includes(one.id)).at(-1)
  check('starts hidden: an Unscheduled task behind "Show more"', !!hiddenLoose && loose.length > 0, `${loose.length} shown`)
  if (hiddenLoose) {
    await palette()
    await h.keyboard.type(hiddenLoose.title, { delay: 10 })
    const hit = h.locator(`[data-drag-open="task:${hiddenLoose.id}"]`).first()
    await hit.waitFor({ timeout: 5000 })
    const mid = await heard()
    await hit.click()
    await h.waitForFunction((id) => document.querySelector(`[data-task-row][data-id="${id}"][data-open]`), hiddenLoose.id, { timeout: 5000 }).catch(() => {})
    await wait(500)
    const where = await h.evaluate((id) => ({ page: document.querySelector(`[data-task-row][data-id="${id}"]`)?.closest('[data-page]')?.getAttribute('data-page') ?? document.querySelector('[data-page]')?.getAttribute('data-page') }), hiddenLoose.id)
    const sounds = (await said()).slice(mid)
    const seen = await look(where.page, hiddenLoose.id)
    check(`⌘K onto a task with no day: its row on ${where.page} drawn, in view, marked open`, seen.drawn && seen.inView && seen.open, JSON.stringify(seen))
    check('Calendar ⌘K onto a task: one sound at most', sounds.length <= 1, sounds.join(', '))
  }

  // 14. Spread over the page, a search cleared: the one looked at is back in view, the keyboard on it.
  await h.evaluate(() => localStorage.setItem('view:captures:All captures', JSON.stringify({ pane: 'wide', wideDensity: 'list', group: 'kind' })))
  await h.reload(); await wait(1800)
  // Everything is the Inbox with "Show sorted too" on: its own Display, kept as All captures'. By kind, as it was: its last island holds notes, not tasks (a task opens in a pane of its own).
  await go('all'); await wait(1200)
  const last = h.locator('[data-page="inbox"] [data-row][data-id]').last()
  await last.click(); await wait(500)
  const peeked = await last.getAttribute('data-id')
  const words = (await last.innerText()).split(/\s+/).filter((one) => one.length > 3).slice(0, 2).join(' ')
  const field = h.locator('[data-page="inbox"] input[placeholder="Search in Inbox"]').first()
  await field.click(); await h.keyboard.type(words, { delay: 20 }); await wait(700)
  await h.keyboard.press('Meta+a'); await h.keyboard.press('Backspace'); await wait(1000)
  const cleared = await look('inbox', peeked)
  check('a search cleared: the one looked at is drawn, in view, marked and under the keyboard', cleared.drawn && cleared.inView && cleared.open && cleared.cursor, JSON.stringify(cleared))
  await h.evaluate(() => localStorage.removeItem('view:captures:All captures'))

  // 15. Quick capture's Inbox tab: back (⌘[) to a capture whose island was folded since.
  const b = c.page
  await c.electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((one) => !one.webContents.getURL().includes('view=')); w?.setBounds({ x: 40, y: 40, width: 1200, height: 800 }); w?.show(); w?.focus() })
  await b.waitForTimeout(1200)
  const boxHead = b.locator('[data-island-head="Note"]').first()
  if (await boxHead.count()) {
    if ((await boxHead.getAttribute('aria-expanded')) !== 'true') (await boxHead.click(), await b.waitForTimeout(400))
    const boxRows = await b.evaluate(() => [...document.querySelectorAll('[data-island="Note"] [data-row][data-id]')].map((one) => one.dataset.id))
    const [X, Y] = boxRows
    await b.locator(`[data-row][data-id="${X}"]`).first().click(); await b.waitForTimeout(900)
    await b.locator(`[data-row][data-id="${Y}"]`).first().click(); await b.waitForTimeout(900)
    await boxHead.click(); await b.waitForTimeout(500)
    check('box: starts hidden, its island folded', !(await b.evaluate((id) => !!document.querySelector(`[data-row][data-id="${id}"]`), X)))
    const before = await b.evaluate(() => ((window.haligtreeHeard ?? []).length = 0))
    await b.evaluate(() => (document.activeElement)?.blur?.())
    await b.keyboard.press('Meta+BracketLeft'); await b.waitForTimeout(1500)
    const seen = await b.evaluate((id) => {
      const row = document.querySelector(`[data-row][data-id="${id}"]`)
      if (!row) return { drawn: false }
      let box = row.parentElement
      while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement
      const at = row.getBoundingClientRect(), view = box?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight }
      return { drawn: true, inView: at.top >= view.top - 1 && at.bottom <= view.bottom + 1, open: row.hasAttribute('data-open'), cursor: row.hasAttribute('data-cursor') }
    }, X)
    const sounds = (await b.evaluate(() => [...(window.haligtreeHeard ?? [])])).slice(before)
    check('box: back to it, its row drawn, in view, marked open, under the keyboard', seen.drawn && seen.inView && seen.open && seen.cursor, JSON.stringify(seen))
    check('box: one sound at most', sounds.length <= 1, sounds.join(', '))
  } else check('box: its Inbox list has a Note island', false)

  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
