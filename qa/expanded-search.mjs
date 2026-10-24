// The expanded view writes like a page in Pages (note-powers.tsx): picked
// words get the selection bar with Capture and Gem, the Properties block sits
// under the title, / opens the slash menu. And a list's search with a kind chip
// on searches only that kind, says "Nothing matches" when nothing does, and
// clearing it keeps the chip: the Inbox, then Gems and Pages.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/expanded-search.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, go, errors } = c
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-row][data-id]')].filter((one) => one.offsetParent).length)
const empty = () => h.evaluate(() => document.body.innerText.includes('Nothing matches'))
const chipOn = (label) => h.evaluate((l) => [...document.querySelectorAll('[data-filter-chips] button[aria-pressed]')].find((b) => b.textContent.trim() === l)?.getAttribute('aria-pressed') === 'true', label)
const chip = (label) => h.evaluate((l) => [...document.querySelectorAll('[data-filter-chips] button[aria-pressed]')].find((b) => b.textContent.trim() === l)?.click(), label)
const search = async (words) => { await h.fill('input[placeholder^="Search in"]', words); await h.waitForTimeout(500) }
const spread = async () => {
  const wide = h.locator('button[aria-label="Spread the list over the page"]')
  if (await wide.count()) { await wide.first().click(); await h.waitForTimeout(700) }
}
try {
  // Job 1: the expanded view.
  const all = await h.evaluate(() => window.api.captures.list())
  const note = all.find((one) => one.status === 'open' && one.label && one.kind === 'note') ?? all.find((one) => one.status === 'open')
  await go('inbox')
  await h.evaluate((id) => window.dispatchEvent(new CustomEvent('haligtree:expand', { detail: id })), note.id)
  await h.waitForTimeout(1500)
  const sheet = '[data-expanded-note] .ProseMirror'
  check('the expanded view shows the note in an editor', await h.locator(sheet).count() > 0)
  check('the Properties block sits under its title', await h.locator('[data-expanded-note] [data-property-strip]').count() > 0)
  await h.locator(`${sheet} p`).first().click({ clickCount: 3 })
  await h.waitForTimeout(700)
  const bar = await h.evaluate(() => ({ gem: [...document.querySelectorAll('button[aria-label="Gem"]')].some((b) => b.offsetParent), capture: [...document.querySelectorAll('button[aria-label="Capture"]')].some((b) => b.offsetParent) }))
  check('picked words get the selection bar with Gem and Capture', bar.gem && bar.capture, JSON.stringify(bar))
  await h.keyboard.press('End')
  await h.keyboard.press('Enter')
  await h.keyboard.type('/')
  await h.waitForTimeout(600)
  const slash = await h.evaluate(() => !!document.querySelector('[role="listbox"], [data-slash-menu], .tiptap-slash-menu, [role="menu"]'))
  check('/ opens the slash menu', slash)
  await h.keyboard.press('Escape')
  await h.keyboard.press('Backspace')
  await h.keyboard.press('Backspace')
  await h.keyboard.press('Escape')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)
  check('Esc closes the expanded view', await h.locator('[data-expanded-note]').count() === 0)

  // Job 2: the Inbox's search with the Quote chip on.
  await go('inbox')
  await spread()
  const open = all.filter((one) => one.status === 'open' && !one.archivedAt)
  const quotes = open.filter((one) => one.kind === 'quote' && one.label)
  const word = quotes[0]?.label.toLowerCase().split(/\s+/).find((w) => w.length > 4) ?? ''
  // A word some other kind's title has and no quote's does.
  const other = open.filter((one) => one.kind !== 'quote').flatMap((one) => one.label.toLowerCase().split(/\s+/)).find((w) => w.length > 4 && /^[a-z]+$/.test(w) && !quotes.some((q) => q.label.toLowerCase().includes(w)))
  await chip('Quote')
  await h.waitForTimeout(600)
  check('the Quote chip is on', await chipOn('Quote'))
  const before = await rows()
  check('with the chip on, the list holds the quotes only', before > 0 && before <= quotes.length, `${before} rows, ${quotes.length} quotes`)
  await search(word)
  const want = quotes.filter((one) => one.label.toLowerCase().includes(word)).length
  check(`searching "${word}" finds only the quotes with it`, (await rows()) === want, `${await rows()} rows, ${want} wanted`)
  await search(other ?? 'zzzz')
  check(`"${other}" (in other kinds only) gives Nothing matches`, (await rows()) === 0 && (await empty()), `${await rows()} rows`)
  const graph = await h.evaluate(() => [...document.querySelectorAll('[data-kind-chips] button')].some((b) => b.textContent.trim() === 'Graph'))
  check('the chip row, Graph too, stays while nothing matches', graph)
  await search('')
  check('clearing the search keeps the Quote chip on', await chipOn('Quote'))
  check('and shows the quotes again', (await rows()) === before, `${await rows()} of ${before}`)
  await chip('Quote')
  await h.waitForTimeout(400)

  // Sweep: Gems and Pages, with a kind chip on.
  for (const [view, tier] of [['nuggets', 'nugget'], ['articles', 'article']]) {
    await go(view)
    await spread()
    check(`${view}: the search box is on the header line, not behind ⋯`, await h.locator('input[placeholder^="Search in"]').isVisible())
    const items = (await h.evaluate((t) => window.api.haligtree('items', t), tier)).filter((one) => !one.archivedAt)
    const kinds = await h.evaluate(() => [...document.querySelectorAll('[data-filter-chips] button[aria-pressed]')].map((b) => b.textContent.trim()))
    if (!kinds.length) { check(`${view}: no kind chips to try`, true, 'one kind only'); continue }
    await chip(kinds[0])
    await h.waitForTimeout(600)
    const n = await rows()
    const ones = items.filter((one) => one.title)
    const hit = await h.evaluate(() => [...document.querySelectorAll('[data-row][data-id]')].filter((one) => one.offsetParent).map((one) => one.getAttribute('data-id')))
    const mine = ones.filter((one) => hit.includes(one.id))
    const w = mine[0]?.title.toLowerCase().split(/\s+/).find((x) => x.length > 3) ?? ''
    await search(w)
    const want2 = mine.filter((one) => one.title.toLowerCase().includes(w)).length
    check(`${view}: "${w}" with ${kinds[0]} on finds that kind's only`, (await rows()) === want2, `${await rows()} rows, ${want2} wanted`)
    await search('zzqqxx')
    check(`${view}: no match says Nothing matches`, (await rows()) === 0 && (await empty()))
    await search('')
    check(`${view}: clearing keeps ${kinds[0]} on`, (await chipOn(kinds[0])) && (await rows()) === n, `${await rows()} of ${n}`)
    await chip(kinds[0])
  }
  check('no page errors', !errors.some((e) => e.includes('PAGEERROR')), errors.slice(0, 3).join(' | '))
} catch (e) {
  check('probe ran', false, e.message)
} finally {
  await c.close()
}
done()
