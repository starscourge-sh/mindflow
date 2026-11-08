// "Open it" on "You already wrote this" opens the OTHER note beside this one,
// to compare the two before joining them; this note stays where it is.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/offer-open.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 900 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const para = (text) => JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const panes = () => h.evaluate(() => {
  const kept = JSON.parse(localStorage.getItem('split') ?? 'null')
  return [...document.querySelectorAll('[data-split-area] [data-pane]')].map((el) => {
    const pane = kept?.panes.find((one) => one.key === el.getAttribute('data-pane'))
    const tab = pane?.tabs.find((one) => one.key === pane.active)
    const view = tab ? tab.trail.views[tab.trail.at] : null
    return view?.focus ?? view?.id ?? null
  })
})
try {
  await v('settings:set', { sounds: false, hintRate: 0, noteOffers: true })
  const first = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para('Feed the sourdough starter twice a day at room temperature. It is ready when it doubles and smells sour and sweet. Weigh the flour, cups lie.'))
  const again = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para('It is ready when it doubles and smells sour and sweet. Feed the sourdough starter twice a day at room temperature. Weigh the flour, cups lie!'))
  await send('capture', again); await wait(2500)
  // The notice comes once the note has been read against the book: up to 12 s.
  const shown = await h.locator('[data-offer-action="open"]').first().waitFor({ timeout: 12000 }).then(() => 1, () => 0)
  check('the note is told it was written before, with "Open it"', shown >= 1, String(shown))
  const before = await panes()
  await h.click('[data-offer-action="open"]'); await wait(2000)
  const after = await panes()
  console.log('PANES', JSON.stringify({ first, again, before, after }))
  check('"Open it" adds a pane', after.length === before.length + 1, `${before.length} -> ${after.length}`)
  check('the new pane shows the OTHER note', after.includes(first), JSON.stringify(after))
  check('and this note stays where it was', after[0] === again, JSON.stringify(after))
  // The same from a gem open in the Gems list: the list and its gem stay, the other gem opens beside.
  const one = await v('nugget:from', 'Feed the sourdough starter twice a day at room temperature. It is ready when it doubles and smells sour and sweet. Weigh the flour, cups lie.', {})
  const two = await v('nugget:from', 'It is ready when it doubles and smells sour and sweet. Feed the sourdough starter twice a day at room temperature. Weigh the flour, cups lie!', {})
  const idOf = (x) => (typeof x === 'string' ? x : x?.id)
  await h.keyboard.press('Meta+w').catch(() => {}); await wait(600)
  await send('nugget', idOf(two)); await wait(2500)
  const gemsBefore = await panes()
  // The button in the pane the gem is in (the note in the first pane has the same notice).
  const right = await h.evaluate(() => [...document.querySelectorAll('[data-split-area] [data-pane]')].at(-1)?.getAttribute('data-pane'))
  const button = h.locator(`[data-pane="${right}"] [data-offer-action="open"]`).first()
  const told = await button.waitFor({ timeout: 12000 }).then(() => true, () => false)
  check('a gem in a second pane is told too', told)
  if (told) {
    await button.click(); await wait(2000)
    const gemsAfter = await panes()
    console.log('GEMS', JSON.stringify({ one: idOf(one), two: idOf(two), gemsBefore, gemsAfter }))
    // The match may be the gem or the earlier note with the same words: either way a different note, in a new pane.
    check('from a second pane, the other note opens in a pane beside it', gemsAfter.length === gemsBefore.length + 1, JSON.stringify(gemsAfter))
    check('and the gem you were on stays in its pane', gemsAfter.slice(0, -1).includes(idOf(two)), JSON.stringify(gemsAfter))
    check('the other note is not the one you were on', gemsAfter.at(-1) !== idOf(two))
  }
} finally {
  await c.close()
}
done()
