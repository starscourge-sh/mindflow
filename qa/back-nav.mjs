// Back, after every way of going somewhere in the main window: the page you
// were on, as you left it. Each case reaches a starting state, takes one
// click (or key, or a send from another window), then goes Back with ⌘[,
// Forward with ⌘], and Back again with the Back button. Both Backs must land
// on exactly the starting state: the same section, the same open note or
// none, the same tab, about the same scroll.
//
//   npx electron-vite build --outDir out-back
//   QA_ARGS=--sandbox QA_ENTRY=out-back/main/index.js node qa/back-nav.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-back-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const c = await sandbox({ width: 1440, height: 900 })
const { h, send } = c
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
const results = []

const wait = (ms = 900) => h.waitForTimeout(ms)

/** Where you are, read off the screen: never from the app's own idea of it. */
const state = () => h.evaluate(() => {
  const page = document.querySelector('[class*="@container/page"]')
  const pane = page?.querySelector('.note-pane')
  const words = (pane?.querySelector('textarea.font-heading, input.font-heading')?.value || pane?.querySelector('input')?.value || pane?.querySelector('.ProseMirror')?.firstElementChild?.textContent || '').trim()
  const tops = page ? [...page.querySelectorAll('*')].map((one) => one.scrollTop).filter(Boolean) : []
  const tabs = page ? [...page.querySelectorAll('[role="tab"][aria-selected="true"], header [aria-pressed="true"]')].map((one) => (one.textContent ?? '').trim() || one.getAttribute('aria-label')) : []
  // The period a day, week, month or year page shows, by its title.
  const title = [...(page?.querySelectorAll('h1, h2, h3') ?? [])].map((one) => (one.textContent ?? '').trim()).find(Boolean) ?? ''
  return {
    view: document.querySelector('header h1')?.textContent ?? '',
    open: page?.querySelector('[data-open][data-id]')?.getAttribute('data-id')?.slice(0, 8) ?? (words ? 'pane' : '-'),
    note: words.slice(0, 28),
    tab: tabs.join('|'),
    title: title.slice(0, 60),
    scroll: Math.max(0, ...tops)
  }
})
const show = (s) => `${s.view || '?'}${s.title && s.title !== s.view ? ` "${s.title}"` : ''}${s.open !== '-' ? ` open:${s.note || s.open}` : ''}${s.tab ? ` tab:${s.tab}` : ''}${s.scroll > 40 ? ` scroll:${s.scroll}` : ''}`
// Rolling text draws each letter twice while it settles: the letters used, not their order, say which day or tab it is.
// Digits left out: a title with the time in it (Today's brief) ticks over mid-test.
const letters = (text) => [...new Set(text.replace(/[\s\d]/g, ''))].sort().join('')
const same = (a, b) => a.view === b.view && a.open === b.open && a.note === b.note && letters(a.tab) === letters(b.tab) && letters(a.title) === letters(b.title) && Math.abs(a.scroll - b.scroll) <= 60

const blur = () => h.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur())
/** Click the first element matching, whose text includes `text` if given. */
const click = async (selector, text) => {
  const done = await h.evaluate(([s, t]) => {
    // Rolling text doubles its letters while it settles.
    const found = [...document.querySelectorAll(s)].find((one) => !t || (one.textContent ?? '').includes(t) || (one.textContent ?? '').replace(/(.)\1/g, '$1').includes(t) || one.getAttribute('aria-label') === t)
    found?.click()
    return !!found
  }, [selector, text])
  if (!done) throw new Error(`nothing to click: ${selector} ${text ?? ''}`)
  await wait()
}
const side = (label) => click(`aside nav button[aria-label="${label}"]`)
const nth = async (selector, n) => {
  const done = await h.evaluate(([s, i]) => {
    const found = document.querySelectorAll(s)[i]
    found?.click()
    return !!found
  }, [selector, n])
  if (!done) throw new Error(`no ${selector} #${n}: ${JSON.stringify(await state())}, ${await h.evaluate((s) => document.querySelectorAll(s).length, selector)} found`)
  await wait()
}
/** A link inside the open note: ProseMirror takes the pointer itself, so a real click. */
const link = async (text) => { await h.locator('.note-pane a.tiptap-note-link', { hasText: text }).first().click(); await wait() }
/** The link brought into view first, the way you would scroll to it before clicking. */
const reveal = async (text) => { await h.locator('.note-pane a.tiptap-note-link', { hasText: text }).first().scrollIntoViewIfNeeded(); await wait(300) }
const row = (n) => nth('[class*="@container/page"] [data-id]', n)
const go = async (id) => { await send('view', id); await wait() }
const keys = async (...list) => { await blur(); for (const one of list) { await h.keyboard.press(one); await h.waitForTimeout(80) } await wait() }
const scrollPage = (top) => h.evaluate((y) => {
  const page = document.querySelector('[class*="@container/page"]')
  const box = [...page.querySelectorAll('*')].find((one) => one.scrollHeight > one.clientHeight + 200 && getComputedStyle(one).overflowY !== 'visible')
  if (box) box.scrollTop = y
  return box?.scrollTop ?? 0
}, top)
const captures = await h.evaluate(() => window.api.captures.list())
const captureId = (start) => captures.find((one) => (one.label ?? '').startsWith(start))?.id
const tasks = await c.v('tasks')

async function run(name, setup, act) {
  if (only.length && !only.some((one) => name.includes(one))) return
  try {
    await go('home')
    await setup()
    await wait(400)
    const before = await state()
    await act()
    const after = await state()
    await keys('Meta+BracketLeft')
    const viaKey = await state()
    await keys('Meta+BracketRight')
    const forward = await state()
    await h.evaluate(() => document.querySelector('header button[aria-label="Back"]')?.click())
    await wait()
    const viaButton = await state()
    const ok = !same(before, after) && same(before, viaKey) && same(before, viaButton) && same(after, forward)
    results.push({ name, ok, before: show(before), after: show(after), key: show(viaKey), button: show(viaButton), forward: show(forward), moved: !same(before, after) })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      before   ${show(before)}\n      click    ${show(after)}\n      ⌘[       ${show(viaKey)}\n      ⌘]       ${show(forward)}\n      Back btn ${show(viaButton)}`)
  } catch (error) {
    results.push({ name, ok: false, before: '', after: String(error.message ?? error).slice(0, 120) })
    console.log(`FAIL  ${name}  (${String(error.message ?? error).slice(0, 200)})`)
  }
}

try {
  // --- Moving between sections -------------------------------------------------------
  await run('sidebar: Home → Inbox', async () => {}, () => side('Inbox'))
  await run('sidebar: the same row twice is one step', async () => {}, async () => { await side('Inbox'); await side('Inbox') })
  await run('G and a letter: Home → G I', async () => {}, () => keys('g', 'i'))
  await run('Haligtree menu: Settings', async () => {}, async () => { await go('settings') })
  await run('Home scrolled, a card opened', async () => { await wait(800); await scrollPage(600) }, () => click('[class*="@container/page"] [data-nav]'))
  await run('Home: a filter chip, then a section', async () => { await click('[role="tab"]', 'Gems') }, () => side('Inbox'))
  await run('Home: See all on a shelf', async () => {}, () => click('[class*="@container/page"] button', 'Show all'))

  // --- Captures --------------------------------------------------------------------------
  await run('Inbox: nothing open, a row opened', async () => { await side('Inbox') }, () => row(1))
  await run('Inbox: one open, another row opened', async () => { await side('Inbox'); await row(0) }, () => row(2))
  await run('Inbox: a mention to another capture', async () => { await side('Inbox'); await send('capture', captureId('Start here')); await wait(); await side('Inbox'); await click('[class*="@container/page"] [data-id]', 'Start here'); await reveal('Kessel Run') },
    () => link('Kessel Run'))
  await run('Inbox: a mention to a goal', async () => { await side('Inbox'); await click('[class*="@container/page"] [data-id]', 'Start here'); await reveal('Get to Mars') },
    () => link('Get to Mars'))
  // Escape never goes back (qa/esc.mjs): ⌘K to another note is the step here instead.
  await run('Inbox: one open, ⌘K to another', async () => { await side('Inbox'); await row(0) }, async () => {
    await keys('Meta+k'); await h.keyboard.type('Dorian Gray', { delay: 40 }); await wait(1200); await h.keyboard.press('Enter'); await wait()
  })
  await run('Inbox list scrolled, a row opened', async () => { await side('Inbox'); await scrollPage(300) }, () => row(14))
  await run('All: one open, ⌘K to another', async () => { await go('all'); await row(3) }, async () => {
    await keys('Meta+k'); await h.keyboard.type('Dorian Gray', { delay: 40 }); await wait(1200); await h.keyboard.press('Enter'); await wait()
  })
  await run('All: one open, sent from another window', async () => { await go('all'); await row(3) }, async () => { await send('capture', captureId('The Odyssey')); await wait(1200) })
  await run('Inbox: one open, a task sent from another window', async () => { await side('Inbox'); await row(1) }, async () => { await send('task', tasks.find((one) => one.status === 'open').id); await wait(1200) })

  await run('Inbox: a backlink under the note', async () => { await side('Inbox'); await click('[class*="@container/page"] [data-id]', 'Kessel Run') },
    () => click('.note-pane button[data-row]'))
  await run("Inbox: the note's Next arrow", async () => { await side('Inbox'); await row(0) }, () => click('.note-pane button[aria-label="Next"]'))
  await run('A kind: one open, another row', async () => { await go('kind:quote'); await row(0) }, () => row(1))

  // --- Kept --------------------------------------------------------------------------------
  await run('Gems: one open, another row', async () => { await side('Gems'); await row(0) }, () => row(1))
  await run('Questions: Answered, then a section', async () => { await side('Questions'); await click('[class*="@container/page"] button', 'Answered') }, () => side('Home'))
  await run('Questions: one open, then a section', async () => { await side('Questions'); await row(0) }, () => side('Home'))
  await run('Goals: one open, then a section', async () => { await go('goals'); await row(0) }, () => side('Today'))

  // --- Tasks ---------------------------------------------------------------------------------
  await run('Today: a task open, then G Y', async () => { await side('Today'); await nth('[class*="@container/page"] button[data-row]', 0) }, () => keys('g', 'y'))
  await run('Upcoming: a task open, another', async () => { await go('upcoming'); await nth('[class*="@container/page"] button[data-row]', 0) }, () => nth('[class*="@container/page"] button[data-row]', 1))
  await run('Week: a task open, then a section', async () => { await go('week'); await click('[data-day] button[data-cursor], [data-day] button') }, () => side('Inbox'))
  await run('Matrix: a task open, then a section', async () => { await go('matrix'); await click('[data-quadrant] button') }, () => side('Inbox'))

  // --- Days, weeks, months ------------------------------------------------------------------
  await run('Day: yesterday, then a section', async () => { await go('day'); await keys('ArrowLeft') }, () => side('Inbox'))
  await run('Week page: an earlier week, then a section', async () => { await go('weekpage'); await nth('section[aria-label="Earlier weeks"] button', 0) }, () => side('Inbox'))
  await run('Month page: an earlier month, then a section', async () => { await go('monthpage'); await nth('section[aria-label="Earlier months"] button', 0) }, () => side('Inbox'))
  await run('Year: a month opened', async () => { await go('yearpage') }, () => click('[class*="@container/page"] button[aria-current="date"]'))

  await run("Today's page: a row of the day's brief", async () => { await go('day') }, () => click('[class*="@container/page"] li button[class*="group/row"]'))
  // ⌘K's "Your month, wrapped" is a story over the page, not a step: Esc puts it away and the page is as it was.
  {
    await side('Inbox'); await row(0)
    const was = await state()
    // Enter only once the action is listed and first: on a busy machine the
    // search could still be on the last result, and Enter took that instead.
    await keys('Meta+k'); await h.keyboard.type('month, wrapped', { delay: 40 })
    await h.waitForFunction(() => /month, wrapped/i.test(document.querySelector('[role="dialog"][aria-label="Search"] [data-search-at]')?.textContent ?? ''), null, { timeout: 8000 })
    await h.keyboard.press('Enter'); await wait(1500)
    const story = await h.evaluate(() => !!document.querySelector('[data-wrap-story]'))
    await h.keyboard.press('Escape'); await wait()
    const gone = await h.evaluate(() => !document.querySelector('[data-wrap-story]'))
    const now = await state()
    const ok = story && gone && same(was, now)
    results.push({ name: '⌘K: your month, wrapped', ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ⌘K: your month, wrapped, over the page; Esc puts it away and the page is as it was  (story ${story}, gone ${gone})\n      before   ${show(was)}\n      after    ${show(now)}`)
  }

  // --- Tags ------------------------------------------------------------------------------------
  await run('Tags: a tag picked from the list', async () => { await go('tags') }, () => click('[class*="@container/page"] button', 'renaissance'))
  await run('Tag page: an entry opened', async () => { await send('tag', 'renaissance'); await wait() }, () => click('[class*="@container/page"] article [role="link"]'))
  await run('Tag page: Manage, then a section', async () => { await send('tag', 'renaissance'); await wait(); await click('[role="tab"]', 'anage') }, () => side('Inbox'))

  // --- Beside the page -------------------------------------------------------------------------
  await run('Recent: an entry opened, beside Inbox', async () => { await side('Inbox'); await row(0); await keys('Meta+Shift+y') }, () => click('aside[aria-label="Recent"] button', 'Kessel'))
} finally {
  await c.close()
}

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed.`)
if (failed.length) console.log(`Failed: ${failed.map((one) => one.name).join('; ')}`)
process.exit(failed.length ? 1 : 0)
