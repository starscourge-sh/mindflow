// A name's card on a page in a split comes up at the name, never beside the page over the other half. Reported 12 Nov
// with a picture ("look at where the lord henry tool tip comes up"): the Feed in the left half of a split, the card for
// "Lord Henry" over the Settings page in the right half. A scroller under three fifths of the window counted as "a
// narrow list", whose cards go beside it (note-preview.tsx sideList); a page in half a split is that narrow.
// On its own, away from qa/hover-cards.mjs, which stops early on an older fault of the Feed's ("Connected to").
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<dir> node qa/hover-card-split.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS
const card = () => h.locator('[data-note-preview]')
const NAME = '[data-feed-account][data-note^="person:"]'

/** Rests the pointer on a name with a real move and says where the name is, where its card came up, and the panes. */
const rested = async (locator) => {
  await locator.scrollIntoViewIfNeeded()
  await wait(400)
  const name = await locator.boundingBox()
  await h.mouse.move(name.x - 30, name.y - 30)
  await h.mouse.move(name.x + 4, name.y + name.height / 2, { steps: 4 })
  // The card comes after its pause and its words are read from the book: waited for, up to three seconds (a fixed
  // second read "no card" on a busy machine), then given a moment to settle where it stands.
  await card().first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
  await wait(250)
  const up = await card().boundingBox().catch(() => null)
  const panes = await h.evaluate(() => [...document.querySelectorAll('[data-pane]')].filter((one) => one.getClientRects().length).map((one) => { const r = one.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right) } }))
  const round = (box) => box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) }
  return { name: round(name), card: round(up), panes, own: panes.find((one) => name.x >= one.left && name.x < one.right) }
}
/** At the name: its left edge on the name's (or pulled in from the window's edge), right under it or right over it. */
const atName = (seen) => !!seen.card && Math.abs(seen.card.x - seen.name.x) <= 12 && (Math.abs(seen.card.y - (seen.name.y + seen.name.h)) <= 14 || Math.abs(seen.card.y + seen.card.h - seen.name.y) <= 14)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false })
  await go('feed'); await wait(1500)
  const names = h.locator(NAME)
  check('the Feed has a post with a person\'s name to point at', await names.count() > 0, String(await names.count()))

  // The whole window first: what "at the name" looks like.
  const whole = await rested(names.first())
  check('whole window: the card comes up at the name', atName(whole), JSON.stringify(whole))
  await h.mouse.move(5, 5); await wait(500)

  // The same page in half a split.
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:split-right')))
  await wait(1500)
  const half = await rested(h.locator(NAME).first())
  check('the window is split in two', half.panes.length === 2, JSON.stringify(half.panes))
  check('the Feed is under three fifths of the window now (what counted as a narrow list)', !!half.own && half.own.right - half.own.left < 1400 * 0.6, JSON.stringify(half.own))
  check('in a split, the name\'s card comes up at the name', atName(half), JSON.stringify({ name: half.name, card: half.card }))
  check('...in its own half, never over the page beside it', !!half.card && !!half.own && half.card.x >= half.own.left && half.card.x < half.own.right, JSON.stringify({ card: half.card?.x, own: half.own }))
  if (shots) await h.screenshot({ path: `${shots}/hover-card-split.png` })
  // A quote's signature on a gem open in the right half, its properties panel beside it narrowing the note's column
  // (the user, 23 Nov: Leonardo's card came up over Settings in the left half).
  await h.mouse.move(5, 5); await wait(400)
  const quote = (await v('items', 'nugget')).find((one) => one.kind === 'quote' && one.attribution)
  if (quote) {
    await c.send('nugget', quote.id); await wait(1800)
    const signed = h.locator('[data-signed-edit] [data-note^="person:"]').last()
    if (await signed.count()) {
      const gem = await rested(signed)
      if (shots) await h.screenshot({ path: `${shots}/hover-card-split-signature.png` })
      check('...and no tooltip stands beside its card', !(await h.locator('[data-slot="tooltip-content"]').evaluateAll((all) => all.some((one) => one.getBoundingClientRect().width && getComputedStyle(one).visibility !== 'hidden'))))
      check('a quote\'s signature in a split: its card at the name, in its own half', atName(gem) && !!gem.own && gem.card.x >= gem.own.left && gem.card.x < gem.own.right, JSON.stringify({ name: gem.name, card: gem.card, own: gem.own }))
    } else console.log('NOTE  no signature drawn on that gem')
  } else console.log('NOTE  no quote gem with who said it in this book')
  await h.mouse.move(5, 5); await wait(500)
  check('no page errors', c.errors.length === 0, c.errors.join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
}
done()
