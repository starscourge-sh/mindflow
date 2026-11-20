// The Feed's insights, as a person meets them: the Feed opened makes three (stand-in Apple Intelligence,
// HALIGTREE_QA_CAPS=ai), each naming the notes it came from and an AI one set apart and labelled; a source opens its
// note; Keep makes a gem linked to its notes; Dismiss takes the card away and lowers its kind's share; the day stops at
// nine; then the same book on a Mac without Apple Intelligence shows Resurface alone.
// Run on a copy of the seeded sandbox: QA_ARGS=--sandbox QA_DATA=<copy> HALIGTREE_QA_AWAY=1 node qa/feed-insights.mjs
// The shares of what is picked (40/25/20/15 over 100 seeded picks) are test/insight-pick.test.ts.
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

if (!process.env.QA_DATA) throw new Error('QA_DATA: a copy of the seeded sandbox, used by both launches')
const { check, done } = checks()
const until = async (h, what, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(200)) if (await what()) return true
  return false
}

process.env.HALIGTREE_QA_CAPS = 'ai'
let s = await sandbox({ width: 1400, height: 900 })
try {
  const { h, v, go } = s
  const cards = h.locator('[data-feed-post="insight"]')
  await go('feed')
  check('the Feed opened makes three insights', await until(h, async () => (await cards.count()) >= 3), await cards.count())
  await h.waitForTimeout(1000)
  check('three at a time, no more', (await cards.count()) === 3, await cards.count())
  const levels = await cards.evaluateAll((all) => all.map((one) => one.dataset.insight))
  check('each names the notes it came from', (await cards.evaluateAll((all) => all.every((one) => one.querySelector('[data-insight-source]')))), levels.join(', '))
  const made = h.locator('[data-feed-post="insight"]:is([data-insight="connect"], [data-insight="reframe"])')
  if (await made.count()) {
    check('an AI card sits in its panel, labelled as made', (await made.first().locator('[data-insight-panel] [data-insight-made]').innerText()).includes('Made by Apple Intelligence'))
  }
  if (await h.locator('[data-insight="resurface"]').count()) check('Resurface is your own line, no panel', (await h.locator('[data-insight="resurface"] [data-insight-panel]').count()) === 0)
  const day = await v('feed:insights')
  const used = day.cards.flatMap((card) => card.sources.map((one) => one.id))
  check('no note twice among the day’s insights', new Set(used).size === used.length, used.length)
  const secret = (await v('items', 'nugget')).filter((one) => one.private).map((one) => one.id)
  check('never a private note', !used.some((id) => secret.includes(id)))

  // A source opens its note.
  const source = cards.first().locator('[data-insight-source]').first()
  const named = await source.innerText()
  await source.click()
  check('a source opens its note', await until(h, async () => (await h.locator('[data-page="feed"] [data-feed]').count()) === 0, 3000), named)
  await go('feed')

  // Keep: a gem, its notes linked under it, and the card says so.
  const first = cards.first()
  const id = await first.getAttribute('data-feed-id')
  const words = (await first.locator('[data-insight-words]').innerText()).trim()
  await first.locator('[data-insight-keep]').click()
  check('Keep: the card says "Kept as a gem"', await until(h, async () => (await h.locator(`[data-feed-id="${id}"] [data-insight-kept]`).count()) === 1, 3000))
  const card = (await v('feed:insights')).cards.find((one) => one.id === id)
  const gem = card?.gemId ? await v('item', card.gemId) : null
  check('Keep makes a gem with its words', !!gem && String(gem.body ?? '').includes(words.slice(0, 40)), words.slice(0, 40))
  check('the gem links every note it came from', !!gem && card.sources.filter((one) => one.type !== 'highlight').every((one) => String(gem.body ?? '').includes(one.id)))

  // Dismiss: the card goes, and its kind comes a little less often.
  const next = cards.nth(1)
  const other = await next.getAttribute('data-feed-id')
  const level = await next.getAttribute('data-insight')
  const before = (await v('feed:insight:mix'))[level]
  await next.locator('[data-insight-dismiss]').click()
  check('Dismiss takes the card away', await until(h, async () => (await h.locator(`[data-feed-id="${other}"]`).count()) === 0, 3000))
  const after = (await v('feed:insight:mix'))[level]
  check('Dismiss lowers its kind’s share a little', after < before && after >= before * 0.8, `${level} ${before} → ${after}`)

  // The day is finite: asked again and again, it stops at nine.
  for (let turn = 0; turn < 6; turn++) (await v('feed:insights:make'), await h.waitForTimeout(600))
  const full = await v('feed:insights')
  check('a day’s batch stops at nine', full.done && full.cards.length <= 9, `${full.cards.length} shown, done ${full.done}`)
  await go('feed')
  check('the end says "That\'s all for today"', (await h.locator('[data-feed-end]').innerText()).includes("That's all for today"))
} finally {
  await s.close()
}

// The same book on a Mac without Apple Intelligence: Resurface alone.
process.env.HALIGTREE_QA_CAPS = 'macos26'
s = await sandbox({ width: 1400, height: 900 })
try {
  const { h, go } = s
  await go('feed')
  await h.waitForTimeout(2500)
  const levels = await h.locator('[data-feed-post="insight"]').evaluateAll((all) => all.map((one) => one.dataset.insight))
  check('without Apple Intelligence only Resurface', levels.length > 0 && levels.every((one) => one === 'resurface'), levels.join(', '))
  check('and nothing labelled as made', (await h.locator('[data-insight-panel]').count()) === 0)
} finally {
  await s.close()
}
done()
