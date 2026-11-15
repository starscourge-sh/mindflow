// Every right-click menu offers only what fits the thing it was opened on:
// on every page, each kind of row with a menu ([data-row-menu]: captures,
// goals, tasks on Today/Upcoming/Later/Routines, map dots, media tiles, feed
// posts, events, days, words, quotes, tags, people, sources, folders).
// no list-wide line (Select, Select all, every goal, "Read as one page") in an
// item's menu, no line that says no once chosen (Copy as image on a pin), every
// line named for what it does, and every line drawn with an icon when its
// siblings have one. Opens the menus on each page's rows, its folders, every
// sidebar row and pin, and a page's own ⋯ menu with its Writing tools.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-l/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/menu-fit.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 1000 })
const { h } = c
// A row that cannot be right-clicked is passed by, not waited on.
h.setDefaultTimeout(2500)
const wait = (ms) => h.waitForTimeout(ms)
// About the whole list, or picking in it: never in one thing's menu.
const LIST_WIDE = /^(select|unselect|select all)$|\ball (goals|notes|tasks|captures)\b|^read as one page$/i
// Names that do not say what they do.
const VAGUE = /^show hidden pages$/i
const bad = { wide: [], refused: [], dots: [], vague: [], hand: [], twice: [], order: [] }
// A run that stalls fails, never hangs: the window is shut and the run ends.
const guard = setTimeout(async () => { console.log('  FAIL the run finished in time (stalled past 10 minutes)'); await c.close?.(); process.exit(1) }, 10 * 60_000)
let menus = 0

// What the open menu (and any menu beside it) holds: each line's words, and whether its drawing is the quiet dot.
const linesNow = () => h.evaluate(() => [...document.querySelectorAll('[role="menu"]')].at(-1)
  ? [...[...document.querySelectorAll('[role="menu"]')].at(-1).querySelectorAll(':scope > [role="menuitem"], :scope > * > [role="menuitem"]')].map((one) => {
      const svg = one.querySelector('svg')
      return { label: one.textContent.replace(/\s+/g, ' ').trim(), sub: one.getAttribute('aria-haspopup') === 'menu', icon: svg ? (svg.classList.contains('lucide-dot') ? 'dot' : 'drawn') : 'none', hand: getComputedStyle(one).cursor === 'pointer', danger: one.getAttribute('data-variant') === 'destructive' }
    })
  : [])
const shut = async () => { for (let i = 0; i < 3 && await h.locator('[role="menu"]').count(); i++) { await h.keyboard.press('Escape'); await wait(150) } }
const look = (where, lines) => {
  if (!lines.length) return
  menus++
  for (const one of lines) {
    const name = one.label.replace(/[⌘⇧⌥⌃↵⌫].*$/, '').replace(/\s[A-Z]$/, '').trim()
    if (LIST_WIDE.test(name)) bad.wide.push(`${where}: ${name}`)
    if (VAGUE.test(name)) bad.vague.push(`${where}: ${name}`)
  }
  if (lines.some((one) => one.icon === 'drawn')) for (const one of lines.filter((one) => one.icon === 'dot')) bad.dots.push(`${where}: ${one.label}`)
  for (const one of lines.filter((line) => !line.hand)) bad.hand.push(`${where}: ${one.label}`)
  const names = lines.map((one) => one.label)
  for (const name of new Set(names.filter((one, at) => one && names.indexOf(one) !== at))) bad.twice.push(`${where}: ${name}`)
  // A line that takes a thing away (red) comes after every other line.
  const lastSafe = lines.findLastIndex((one) => !one.danger)
  if (lines.some((one, at) => one.danger && at < lastSafe)) bad.order.push(`${where}: ${lines.find((one) => one.danger).label} before ${lines[lastSafe].label}`)
}
// A menu read, and the lines beside it read too (Copy, Writing tools).
const readMenu = async (where) => {
  const top = await linesNow()
  look(where, top)
  for (const sub of top.filter((one) => one.sub)) {
    await h.locator('[role="menu"]').last().getByRole('menuitem', { name: sub.label, exact: true }).first().hover().catch(() => {})
    await wait(300)
    if ((await h.locator('[role="menu"]').count()) > 1) look(`${where} > ${sub.label}`, await linesNow())
    await h.keyboard.press('ArrowLeft'); await wait(120)
  }
  return top
}
// Each line that only copies, chosen: none may answer with a refusal.
const tryCopies = async (where, open, top) => {
  const copies = top.filter((one) => /^copy as image|^save as image|^copy all links|^paste a picture|^archive done cards/i.test(one.label)).map((one) => [one.label])
  for (const sub of top.filter((one) => one.sub && /^copy/i.test(one.label))) {
    await h.locator('[role="menu"]').last().getByRole('menuitem', { name: sub.label, exact: true }).first().hover().catch(() => {}); await wait(300)
    for (const one of (await linesNow()).filter((line) => /^copy as image/i.test(line.label))) copies.push([sub.label, one.label])
    await h.keyboard.press('ArrowLeft'); await wait(120)
  }
  await shut()
  for (const path of copies) {
    await h.evaluate(() => (window.__said = []))
    await open(); await wait(300)
    for (const [at, step] of path.entries()) {
      const line = h.locator('[role="menu"]').last().getByRole('menuitem', { name: step, exact: true }).first()
      if (at < path.length - 1) { await line.hover(); await wait(300) } else await line.click().catch(() => {})
    }
    await wait(900)
    const said = await h.evaluate(() => window.__said)
    for (const one of said.filter((toast) => toast.tone === 'warning' || toast.tone === 'error' || /^(no|nothing)\b/i.test(toast.text))) bad.refused.push(`${where}: ${path.join(' > ')} said "${one.text}"`)
    await shut()
  }
}
const openOn = (locator) => async () => { await locator.scrollIntoViewIfNeeded().catch(() => {}); await locator.click({ button: 'right' }); }
const visit = async (where, locator) => {
  if (!(await locator.count()) || !(await locator.isVisible().catch(() => false))) return
  await shut()
  await openOn(locator)().catch(() => {}); await wait(400)
  if (process.env.SAY) console.log('  ' + where)
  const top = await readMenu(where)
  await tryCopies(where, openOn(locator), top)
  await shut()
}

try {
  await wait(2000)
  await h.evaluate(() => { window.__said = []; window.addEventListener('haligtree:toast', (event) => window.__said?.push({ text: event.detail.text, tone: event.detail.tone })) })
  // A picture copied is taken as done, without drawing it: what is checked here is that each line fits and answers.
  await h.evaluate(() => { window.api.copyPicture = async () => true })
  // Every page's rows with a menu, the first few of each kind, and its bar's own ⋯ menus.
  for (const page of ['inbox', 'articles', 'nuggets', 'questions', 'goals', 'today', 'upcoming', 'later', 'routines', 'tags', 'sources', 'queue', 'feed', 'media', 'map', 'matrix', 'discarded', 'archived', 'day', 'week', 'calendar', 'monthpage', 'yearpage', 'lookups', 'review', 'all', 'home']) {
    await c.go(page); await wait(700)
    const main = h.locator('main, [data-page]').first()
    const rows = main.locator('[data-row-menu]:visible')
    const seen = new Map()
    for (let i = 0, n = Math.min(await rows.count(), 25); i < n; i++) {
      // One of each kind: a kind is the row's own data- names (a goal, a folder, a tile).
      const row = rows.nth(i)
      const kind = await row.evaluate((one) => one.tagName + [...one.attributes].map((a) => a.name).filter((a) => a.startsWith('data-') && !/state|row-menu/.test(a)).sort().join(',')).catch(() => null)
      if (!kind || seen.has(kind)) continue
      seen.set(kind, (seen.get(kind) ?? 0) + 1)
      await visit(`${page} ${kind.slice(0, 40)} #${seen.get(kind)}`, row)
    }
    if (process.env.SAY) console.log(`  after ${page}: ${c.errors.length} errors`)
    const bars = main.locator('[data-menu]:visible')
    for (let i = 0, n = Math.min(await bars.count(), 4); i < n; i++) {
      await shut(); await bars.nth(i).click().catch(() => {}); await wait(400)
      await readMenu(`${page} ⋯ ${await bars.nth(i).getAttribute('data-menu')}`); await shut()
    }
  }
  // A page of Writing's own ⋯ menu, and its Writing tools.
  await c.go('articles')
  const first = h.locator('main [data-row]').first()
  if (await first.count()) {
    await first.click(); await wait(1200)
    const more = h.getByRole('button', { name: 'More', exact: true }).first()
    if (await more.count()) { await shut(); await more.click(); await wait(400); await readMenu('a page of Writing ⋯'); await shut() }
  }
  // Every sidebar row: places, folders, pins (a page and a gem pinned) and Recent.
  for (const tier of ['article', 'nugget']) { const [one] = await c.v('items', tier); if (one) await c.v('pin', 'nuggets', one.id, true) }
  // And a capture, pinned from its own menu in the Inbox, as a person pins one.
  await c.go('inbox')
  await shut(); await h.locator('main [data-row]').first().click({ button: 'right' }).catch(() => {}); await wait(400)
  await h.locator('[role="menu"]').last().getByRole('menuitem', { name: /^Pin/ }).first().click().catch(() => {}); await wait(800)
  const side = await h.locator('aside[data-chrome] button:visible').count()
  for (let i = 0; i < side; i++) {
    const row = h.locator('aside[data-chrome] button:visible').nth(i)
    const name = ((await row.getAttribute('aria-label').catch(() => null)) ?? (await row.innerText().catch(() => ''))).trim().slice(0, 30)
    if (!name) continue
    await visit(`sidebar "${name}"`, row)
  }
  console.log(`  ${menus} menus read`)
  check('menus were found and read', menus >= 20, String(menus))
  check('no item menu offers a list-wide line', bad.wide.length === 0, bad.wide.slice(0, 12).join(' | '))
  check('no line chosen answers with a refusal', bad.refused.length === 0, bad.refused.slice(0, 6).join(' | '))
  check('every line has an icon where its siblings do', bad.dots.length === 0, bad.dots.slice(0, 12).join(' | '))
  check('every line says what it does', bad.vague.length === 0, bad.vague.slice(0, 6).join(' | '))
  check('every line shows the hand', bad.hand.length === 0, bad.hand.slice(0, 6).join(' | '))
  check('no line twice in one menu', bad.twice.length === 0, bad.twice.slice(0, 6).join(' | '))
  check('a line that takes something away comes last', bad.order.length === 0, bad.order.slice(0, 6).join(' | '))
  check('no errors on the page', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  clearTimeout(guard)
  await c.close?.()
}
done()
