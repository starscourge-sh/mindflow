// Search ranks where the words are: a note named with them first, then notes
// that have them in their own words, then notes that have them only in a
// picture; ⌘K draws them in islands by kind, the one named with them first in its island.
// A capture made into a gem is found once, as the gem.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/search-rank.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 880 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const para = (...lines) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const named = await v('nugget:from', 'Quokka harbour survey', {})
  const namedId = typeof named === 'string' ? named : named?.id
  await wait(300)
  // Newer notes that only mention the words in their text.
  for (let i = 0; i < 3; i++) await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), para(`Ferry notes ${i}`, 'We saw a quokka harbour sign by the jetty, then lunch.'))
  await wait(500)
  const found = await h.evaluate(() => window.api.captures.find('quokka harbour'))
  console.log('FOUND', JSON.stringify(found.map((one) => [one.type, one.label.slice(0, 30), one.match])))
  check('the note named with the words comes first', found[0]?.id === namedId, found[0]?.label)
  check('it is marked as found in its name', found[0]?.match === 'name')
  check('the notes with the words in their text come after it, marked so', found.slice(1).every((one) => one.match === 'words') && found.length >= 4, JSON.stringify(found.map((one) => one.match)))
  // ⌘K: an island a kind, as the Inbox draws them, the note named with the words first in its island.
  await h.keyboard.press('Meta+k'); await wait(600)
  await h.keyboard.type('quokka harbour', { delay: 20 }); await wait(1200)
  const heads = await h.evaluate(() => [...document.querySelectorAll('[data-island-head]')].map((one) => one.dataset.islandHead))
  // The named one leads the island it is drawn in (a gem's or a note's).
  const top = await h.evaluate((key) => document.querySelector(`[data-drag-open="${key}"]`)?.closest('[data-island]')?.querySelector('[data-drag-open]')?.getAttribute('data-drag-open'), `${found[0]?.type}:${found[0]?.id}`)
  console.log('HEADS', JSON.stringify(heads))
  check('⌘K draws an island a kind, the one named with the words first in its island', heads.includes('Notes') && top === `${found[0]?.type}:${found[0]?.id}`, JSON.stringify([heads, top]))
  if (process.env.QA_SHOTS) await h.screenshot({ path: `${process.env.QA_SHOTS}/search-rank.png` })
} finally {
  await c.close()
}
done()
