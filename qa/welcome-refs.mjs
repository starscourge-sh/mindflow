// Every reference the welcome shows (Become's cards, quick capture's typed
// examples, How a thought grows) can be found in the sandbox, by the search
// ⌘K uses, each by its own title: the welcome and the sandbox tell one story.
//
//   npx electron-vite build --outDir out-welcome && QA_ARGS=--sandbox QA_ENTRY=out-welcome/main/index.js node qa/welcome-refs.mjs
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1000, height: 700 })
const { h } = c
const asks = ['Victor never names the creature', 'Do or do not. There is no try', 'petrichor', 'Dune (novel)', 'Book tickets for Hamlet at the Globe',
  'Frodo never wanted the ring', 'All we have to decide is what to do with the time', 'anagnorisis', 'Rosetta Stone', 'Ask Hermione for the potions notes',
  'Who tells the story?', 'Who is the monster?', 'Read Paradise Lost', 'He learns to speak']
let failed = 0
try {
  for (const ask of asks) {
    const found = await h.evaluate((q) => window.api.captures.find(q), ask)
    // Its own words in the title it is listed by, not just a note that shares a word with it.
    const hit = found.find((one) => one.label.toLowerCase().includes(ask.toLowerCase()))
    if (!hit) failed++
    console.log(`${hit ? 'PASS' : 'FAIL'} ${ask}  (${hit ? `${hit.type}: ${hit.label.slice(0, 70)}` : found.slice(0, 3).map((one) => `${one.type}: ${one.label.slice(0, 40)}`).join(' | ')})`)
  }
  console.log(`${asks.length - failed} of ${asks.length} found`, c.errors.length ? '\n' + c.errors.join('\n') : '')
} finally {
  await c.close()
}
process.exit(failed ? 1 : 0)
