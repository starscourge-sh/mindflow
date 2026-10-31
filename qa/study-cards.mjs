// A card made while reading is a study card: in Review, never in Gems, the
// Feed or Home. ⌥ makes it a gem as well. "Keep as a gem" in Review's card
// menu moves it, and Undo moves it back. A gem made before this keeps its place.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/study-cards.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { lookupServer, openProbePdf, pickInPdf } from './probe-pdf-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const server = await lookupServer()
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS ?? '/tmp'
const wait = (ms) => h.waitForTimeout(ms)
/** Where an item shows: Gems, the Feed, Home, Review. */
const where = async (id) => ({
  gems: (await v('items', 'nugget')).some((one) => one.id === id),
  feed: JSON.stringify(await v('feed')).includes(id),
  home: JSON.stringify(await v('home')).includes(id),
  review: JSON.stringify(await v('review:queue')).includes(id)
})
const cardBy = async (prompt) => (await v('items', 'card')).concat(await v('items', 'nugget')).find((one) => one.prompt === prompt)
/** The reader's C (or ⌥C): the question typed where the words were, Return makes the card. */
const makeCard = async (key, page, question) => {
  await pickInPdf(h, 2, 26, page); await wait(400)
  await h.keyboard.press(key); await wait(600)
  await h.keyboard.type(question); await h.keyboard.press('Enter'); await wait(1200)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, newPerDay: 999, reviewsPerDay: 0 })
  // A tested gem made before the change: it stays a gem, in Gems.
  const old = await v('nugget:from', 'The Venetian Patent Statute (1474)', {})
  await v('item:save', old, { prompt: 'The first patent law?' })
  await openProbePdf(c)
  const tip = await (async () => { await pickInPdf(h, 2, 26, 1); await wait(400); return h.locator('.pdf-keep-bar button[aria-label="Card"]').getAttribute('title') })()
  check('the Card button\'s tip says ⌥ keeps it as a gem too', /⌥C keeps it as a gem too/.test(tip ?? ''), tip)
  await h.evaluate(() => getSelection().removeAllRanges()); await wait(300)

  await makeCard('c', 1, 'Which sentence is worth keeping?')
  const study = await cardBy('Which sentence is worth keeping?')
  check('C makes a study card', study?.tier === 'card', JSON.stringify(study && { tier: study.tier }))
  const at = study ? await where(study.id) : {}
  check('absent from Gems, the Feed and Home', at.gems === false && at.feed === false && at.home === false, JSON.stringify(at))
  check('present in Review', at.review === true, JSON.stringify(at))

  await makeCard('Alt+KeyC', 2, 'Which sentence is on page 2?')
  const gem = await cardBy('Which sentence is on page 2?')
  check('⌥C makes a gem (tested too)', gem?.tier === 'nugget', JSON.stringify(gem && { tier: gem.tier }))
  const gemAt = gem ? await where(gem.id) : {}
  check('a gem is in Gems and in Review', gemAt.gems === true && gemAt.review === true, JSON.stringify(gemAt))
  check('the gem made before stays in Gems', (await v('items', 'nugget')).some((one) => one.id === old), '')

  // Review's card menu moves it either way, with Undo.
  // The sandbox's own cards paused, so the study card comes up first.
  for (const one of await v('review:queue')) if (one.id !== study.id) await v('item:save', one.id, { suspended: true })
  await c.go('review'); await wait(1500)
  const shown = async () => h.evaluate(() => document.querySelector('[data-review-card]')?.textContent ?? '')
  // Step to the study card: the queue's order is its own.
  for (let n = 0; n < 4 && !(await shown()).includes('Which sentence is worth keeping?'); n++) {
    await h.keyboard.press('Space'); await wait(500); await h.keyboard.press('3'); await wait(800)
  }
  const box = await h.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT)
    let text = walker.nextNode()
    while (text && !text.data.includes('Which sentence is worth keeping?')) text = walker.nextNode()
    const r = text?.parentElement?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null
  })
  check('Review shows the study card', !!box, '')
  if (box) {
    await h.mouse.click(box.x, box.y, { button: 'right' }); await wait(500)
    const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map((one) => one.textContent.trim()))
    check('its menu offers "Keep as a gem"', rows.some((one) => one.startsWith('Keep as a gem')), JSON.stringify(rows))
    await h.locator('[role="menuitem"]:has-text("Keep as a gem")').first().click(); await wait(900)
    check('"Keep as a gem" moves it to Gems', (await v('item', study.id))?.tier === 'nugget' && (await v('items', 'nugget')).some((one) => one.id === study.id), '')
    await h.screenshot({ path: `${shots}/study-cards-kept.png` })
    await h.getByRole('button', { name: /^Undo/ }).first().click(); await wait(900)
    check('Undo moves it back to study only', (await v('item', study.id))?.tier === 'card' && !(await v('items', 'nugget')).some((one) => one.id === study.id), '')
  }
  // The gem's page says it is also in Review, and moves it the other way.
  await c.send('nugget', gem.id); await wait(1500)
  const line = await h.evaluate(() => document.querySelector('[data-gem-or-card]')?.textContent ?? '')
  check('a tested gem\'s page says "Also in Review" and offers "Study only"', /Also in Review/.test(line) && /Study only/.test(line), line || String(await h.evaluate((id) => !!document.querySelector(`[data-open="${id}"]`), gem.id)))
  // The switch is a button sized to its words, never a field-wide bar.
  const switchBox = await h.evaluate(() => { const b = document.querySelector('[data-gem-or-card-switch]'); const row = b?.closest('[data-gem-or-card]'); return b && row ? { button: b.getBoundingClientRect().width, row: row.getBoundingClientRect().width, cursor: getComputedStyle(b).cursor } : null })
  check('"Study only" is a small button, not a field-wide bar, with the hand cursor', !!switchBox && switchBox.button < switchBox.row * 0.4 && switchBox.cursor === 'pointer', JSON.stringify(switchBox))
  await h.locator('[data-gem-or-card-switch]').hover().catch(() => {}); await h.waitForTimeout(600)
  await c.both?.(`${process.env.QA_SHOTS ?? '/tmp'}/study-only-switch`)
  await h.screenshot({ path: `${shots}/study-cards-gem-page.png` })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
  await server.close()
}
done()
