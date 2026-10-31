// A snip kept as a card reads as words in All cards: "Picture · The Law Book, p. 3", never its Markdown.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/snip-in-lists.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 900, height: 600 })
try {
  await c.h.waitForTimeout(1500)
  const id = await c.v('nugget:from', '![](haligtree://assets/abc.png)\n\n[The Law Book, p. 3](haligtree://pdf/x.pdf#page=3)', { medium: 'The Law Book', passage: 'p. 3', kind: 'quote' })
  await c.v('item:save', id, { prompt: 'The Venetian Patent Statute (1474)', title: 'The Venetian Patent Statute (1474)' })
  const all = await c.v('cards:all')
  const one = all.find((x) => x.id === id)
  console.log(JSON.stringify(one?.answer))
  check('snip answer reads as words', one && !one.answer.includes('](') && one.answer.startsWith('Picture'), one?.answer)
} catch (e) { check('ran', false, e.message) } finally { await c.close?.() }
done()
