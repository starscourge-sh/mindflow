// Makes the sandbox seed the probes copy: the built app started once with --sandbox on an empty data folder, left
// to lay down its example book (Writing, decks, PDFs, stickies), then closed. The folder it leaves is the seed.
// qa/run-one.sh calls this when qa/local.noindex/seed is missing; it can also be run on its own:
//   QA_DATA=<an empty folder> QA_ENTRY=$PWD/out-gate/main/index.js HALIGTREE_QA_AWAY=1 node qa/make-seed.mjs
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { sandbox } from './sandbox-lib.mjs'

process.env.QA_ARGS ??= '--sandbox'
if (!process.env.QA_DATA) throw new Error('QA_DATA must name the empty folder the seed is made in')

const c = await sandbox()
try {
  const state = await c.v('sandbox:state')
  if (!state?.seeded) throw new Error(`The sandbox did not say it was seeded: ${JSON.stringify(state)}`)
  // A moment for the last writes (pictures, stickies, window sizes) to land before the app closes.
  await c.h.waitForTimeout(3000)
} finally {
  await c.close()
}
if (!existsSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'))) {
  console.log('FAIL  the seed has no sandbox/haligtree.db')
  process.exit(1)
}
console.log(`PASS  seed made in ${process.env.QA_DATA}`)
process.exit(0)
