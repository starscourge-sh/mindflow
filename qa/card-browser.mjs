// The card browser, Review's "All cards" tab: every card listed, found by words, narrowed to a tag and the
// tags under it, sorted; a question rewritten in place; picked cards (⌘A) paused, tagged and untagged at
// once, each with Undo; ⌫ sends them to the Bin. Light and dark screenshots beside Review's "Today".
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/card-browser.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-card-row]')].map((one) => one.textContent ?? ''))
// A chip by its words: the innermost thing that says them, clicked.
const chip = (words) => h.evaluate((source) => [...document.querySelectorAll('[data-card-browser] button[aria-pressed]')].find((one) => new RegExp(source).test(one.getAttribute('aria-label') ?? ''))?.click(), typeof words === 'string' ? `^${words}$` : words.source)
// Each theme reloads the window: `again` brings the page back after each.
const shot = async (name, again) => {
  if (!shots) return
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await again()
    await h.waitForTimeout(600)
    await h.screenshot({ path: join(shots, `${name}-${said}.png`) })
  }
  await c.theme('paper')
  await again()
}
try {
  await call('cards:list', [{ term: 'What is an event horizon?', meaning: 'The edge past which nothing comes back #astrophysics-holes' }, { term: 'Zebra question', meaning: 'Zebra answer #zoo' }])
  const all = await call('cards:all')
  // The list view: All cards opens on its pockets.
  await h.evaluate(() => localStorage.setItem('view:cards', JSON.stringify({ sort: 'due', group: 'none', filter: {}, density: 'list' })))
  await c.go('review')
  await shot('review-today', () => c.go('review', ':today'))
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"]').click())
  check('"All cards" lists every card', await waitFor(async () => (await rows()).length === all.length), `${(await rows()).length} of ${all.length}`)
  await shot('card-browser', async () => { await c.go('review'); await h.evaluate(() => document.querySelector('[data-review-tab="cards"]').click()); await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-row]'))) })
  // Words.
  await h.locator('[data-card-browser] input').first().fill('zebra')
  check('searching finds by words', await waitFor(async () => { const now = await rows(); return now.length === 1 && now[0].includes('Zebra question') }), (await rows()).join(' | '))
  await h.locator('[data-card-browser] input').first().fill('')
  // A tag and the tags under it.
  await chip('#astrophysics')
  const astro = all.filter((one) => one.tags.some((tag) => tag === 'astrophysics' || tag.startsWith('astrophysics-')))
  check('a tag narrows to its cards and those under it', await waitFor(async () => (await rows()).length === astro.length && (await rows()).some((one) => one.includes('event horizon'))), `${(await rows()).length} vs ${astro.length}`)
  const counted = await h.evaluate(() => document.querySelector('[data-card-counts]')?.textContent ?? '')
  const due = astro.filter((one) => !one.paused && one.dueAt && Date.parse(one.dueAt) <= Date.now()).length
  check('new, learning and due are counted for the tag', new RegExp(`${astro.filter((one) => one.stage === 'new' && !one.paused).length} new`).test(counted) && new RegExp(`${due} due now`).test(counted), counted)
  // Sort: Newest puts the cards just made first.
  await chip(/^All \d/)
  // Sorted in Display: Newest, as Display keeps it, then the page opened again.
  await h.evaluate(() => localStorage.setItem('view:cards', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  await c.go('home')
  await waitFor(() => h.evaluate(() => !document.querySelector('[data-card-browser]')), 15000)
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"]').click())
  const made = new Map(all.map((one) => [one.id, one.createdAt]))
  const order = () => h.evaluate(() => [...document.querySelectorAll('[data-card-row]')].map((one) => one.getAttribute('data-card-row')))
  check('sorted newest first', await waitFor(async () => { const ids = await order(); return ids.length === all.length && ids.every((id, at) => !at || made.get(ids[at - 1]) >= made.get(id)) }))
  // Edit in place.
  const zebra = all.find((one) => one.prompt === 'Zebra question')
  await h.evaluate((id) => document.querySelector(`[data-card-row="${id}"] [role="button"]`).click(), zebra.id)
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-edit]')))
  await h.locator('[data-card-edit]').fill('Zebra question, rewritten')
  await h.locator('[data-card-edit]').press('Enter')
  check('a question is rewritten in place', await waitFor(async () => (await call('cards:all')).some((one) => one.prompt === 'Zebra question, rewritten')))
  // Pick them all, pause, tag, untag; each with Undo.
  await h.mouse.click(1100, 760)
  await h.keyboard.press('Meta+a')
  check('⌘A picks every card on show', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-picked]'))))
  await h.evaluate(() => document.querySelector('[data-cards-pause]').click())
  check('Pause pauses every picked card', await waitFor(async () => (await call('cards:all')).every((one) => one.paused)))
  await h.keyboard.press('Meta+z')
  check('and ⌘Z brings them back', await waitFor(async () => (await call('cards:all')).every((one) => !one.paused)), `${(await call('cards:all')).filter((one) => one.paused).length} still paused`)
  await h.locator('[data-card-picked] input').fill('#exam-week')
  await h.evaluate(() => document.querySelector('[data-cards-tag]').click())
  check('a tag goes on every picked card', await waitFor(async () => (await call('cards:all')).every((one) => one.tags.includes('exam-week'))))
  await h.locator('[data-card-picked] input').fill('exam-week')
  await h.evaluate(() => document.querySelector('[data-cards-untag]').click())
  check('and comes off again', await waitFor(async () => (await call('cards:all')).every((one) => !one.tags.includes('exam-week'))))
  // ⌫: the Zebra card alone to the Bin.
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Escape')
  await h.evaluate((id) => document.querySelector(`[data-card-row="${id}"] [role="button"]`).dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true })), zebra.id)
  await h.keyboard.press('Backspace')
  check('⌫ sends a picked card to the Bin', await waitFor(async () => !(await call('cards:all')).some((one) => one.id === zebra.id)))
  // From ⌘K.
  await c.go('home')
  await waitFor(() => h.evaluate(() => !document.querySelector('[data-card-browser]')), 15000)
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('Browse all cards', { delay: 15 })
  await h.waitForTimeout(500)
  await h.keyboard.press('Enter')
  check('⌘K "Browse all cards" opens it', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-browser]'))))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
