// Order implies purpose: wherever kinds are listed, Note comes first, then
// Task, then Quote, Word, Link and Check back (kindRank). Read here from the
// Inbox's kind chips, its chips with "Show sorted too" on, its sections when
// grouped by kind, Pages' and quick capture's kinds. The Inbox, with the switch
// on or off, groups by date to start, newest first, as Pages does. Pages says
// "page", never "article": "New page", "Start a page".
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/kind-order.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const ORDER = ['Note', 'Task', 'Tasks', 'Quote', 'Word', 'Link', 'Check back']
const AGES = ['Today', 'This week', 'This month', 'This year', 'Older']
const rank = (name) => { const at = ORDER.indexOf(name); return at < 0 ? 99 : at === 2 ? 1 : at }
const inOrder = (names, by) => names.every((one, at) => at === 0 || by(names[at - 1]) <= by(one))

/** The kinds among a row of chips, in the order drawn. */
const chips = (sel) => h.evaluate((sel) => [...document.querySelectorAll(`[data-page="inbox"] ${sel} button[aria-pressed], [data-page="inbox"] ${sel} [data-chip-split] button`)]
  .map((one) => one.textContent.replace(/\s+/g, ' ').trim().replace(/\s*\d[\d,]*$/, '')).filter(Boolean), sel)
/** The list's group headings, in the order drawn: plain heads and islands alike. */
const heads = () => h.evaluate(() => [...document.querySelectorAll('[data-page="inbox"] [data-group-head], [data-page="inbox"] [data-island-head]')]
  .map((one) => one.getAttribute('data-group-head') ?? one.getAttribute('data-island-head')))
const sorted = () => h.locator('[data-page="inbox"] [data-sorted-too] button[role="switch"]').first()

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // 1. The Inbox: chips in the one order, sections by date.
  await go('inbox'); await wait(1200)
  const offChips = (await chips('[data-kind-chips]')).filter((one) => ORDER.includes(one))
  check('1. the Inbox\'s kind chips start with Note and keep the one order', offChips[0] === 'Note' && inOrder(offChips, rank), offChips.join(', '))
  const offHeads = await heads()
  check('1. the Inbox groups by date to start', offHeads.length > 0 && offHeads.every((one) => AGES.includes(one)), offHeads.join(', '))
  check('1. … newest first', inOrder(offHeads, (one) => AGES.indexOf(one)), offHeads.join(', '))

  // 2. "Show sorted too": everything, by date, Note's chip before the tasks'.
  await sorted().click(); await wait(1500)
  const onChips = (await chips('[data-everything-filter]')).filter((one) => ORDER.includes(one))
  check('2. with "Show sorted too", Note comes before Task', onChips.indexOf('Note') >= 0 && onChips.indexOf('Task') > onChips.indexOf('Note'), onChips.join(', '))
  check('2. … and every chip keeps the one order', inOrder(onChips, rank), onChips.join(', '))
  const onHeads = await heads()
  check('2. it groups by date to start: Today, This week, This month…', onHeads.length > 0 && onHeads.every((one) => AGES.includes(one)) && inOrder(onHeads, (one) => AGES.indexOf(one)), onHeads.join(', '))

  // 3. Grouped by kind, chosen: the sections in the one order.
  await h.evaluate(() => {
    const key = 'view:captures:All captures'
    const was = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({ ...was, group: 'kind' }))
  })
  await h.reload(); await wait(2200)
  await go('all'); await wait(1500)
  const kindHeads = await heads()
  check('3. grouped by kind, the sections go Note, Tasks, then the rest', kindHeads[0] === 'Note' && kindHeads.includes('Tasks') && inOrder(kindHeads, rank), kindHeads.join(', '))
  await h.evaluate(() => localStorage.removeItem('view:captures:All captures'))

  // 4. Pages says "page": its button, its hints, its empty words.
  await go('articles'); await wait(1200)
  const pages = await h.evaluate(() => document.querySelector('[data-page="articles"]')?.innerText ?? '')
  check('4. Pages has "New page"', /New page/.test(pages), pages.slice(0, 200))
  check('4. … and no "article" anywhere on it', !/\barticles?\b/i.test(pages), (pages.match(/.{0,40}\barticles?\b.{0,40}/i) ?? [''])[0])
  await go('nuggets'); await wait(1000)
  const gems = await h.evaluate(() => document.querySelector('[data-page="nuggets"]')?.innerText ?? '')
  check('4. Gems never says "article" either', !/\barticles?\b/i.test(gems), (gems.match(/.{0,40}\barticles?\b.{0,40}/i) ?? [''])[0])

  // 5. Quick capture's kinds, in "Change type": Note first, Task second.
  const box = c.page
  await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(900)
  await box.keyboard.press('Control+l'); await box.waitForTimeout(600)
  const kinds = await box.evaluate(() => [...document.querySelectorAll('[cmdk-item]')].map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
  const named = kinds.map((one) => ORDER.find((name) => one.startsWith(name) || one.includes(` ${name} `) || one.endsWith(name))).filter(Boolean)
  check('5. quick capture\'s kinds: Note, Task, then the rest', named[0] === 'Note' && named[1] === 'Task' && inOrder(named, rank), kinds.join(' | '))
  await box.keyboard.press('Escape')
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
