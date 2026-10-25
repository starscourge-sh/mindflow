// Every reference the welcome shows (the story Catch, Write and Remember follow, and the postcard,
// quick capture's typed examples, the dial's Review card) can be found in the sandbox, by the search
// ⌘K uses, each by its own title: the welcome and the sandbox tell one story.
//
//   npx electron-vite build --outDir out-welcome && QA_ARGS=--sandbox QA_ENTRY=out-welcome/main/index.js node qa/welcome-refs.mjs
import { sandbox } from './sandbox-lib.mjs'
const c = await sandbox({ width: 1000, height: 700 })
const { h } = c
const asks = ['Do or do not. There is no try', 'petrichor', 'Rewatch The Empire Strikes Back',
  'Frodo never wanted the ring', 'All we have to decide is what to do with the time', 'anagnorisis', 'Rosetta Stone', 'Ask Hermione for the potions notes',
  'Why do old movies feel more real', 'Why old movies feel real', 'Find photos of the Yoda puppet', 'Perfection erases human presence']
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
