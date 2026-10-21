// Does Haligtree do what What Haligtree can do says? Runs every card's Try it and
// Show me in the sandbox, in three parts (a: Catching, Writing, Windows,
// Bringing notes in; b: Remembering; c: Planning, Seeing your year), each
// in a fresh app with a fresh data folder. Same env as the parts: QA_ARGS,
// QA_ENTRY, MINDFLOW_QA_AWAY. PARTS=a,c runs only some.
import { spawnSync } from 'child_process'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const parts = (process.env.PARTS ?? 'a,b,c').split(',')
let failed = []
for (const part of parts) {
  console.log(`\n== powers-claims-${part}`)
  const run = spawnSync(process.execPath, [join(import.meta.dirname, `powers-claims-${part}.mjs`)], {
    stdio: 'inherit',
    env: { ...process.env, QA_DATA: mkdtempSync(join(tmpdir(), `powers-${part}-`)) }
  })
  if (run.status !== 0) failed.push(part)
}
console.log(failed.length ? `\nFAILED parts: ${failed.join(', ')}` : '\nEvery card does what it says.')
process.exit(failed.length ? 1 : 0)
