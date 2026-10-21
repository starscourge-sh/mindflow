// Back after a long time away: Haligtree opens with only capture and Today, and
// "Show everything" brings the rest back for this run.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-calm/main/index.js MINDFLOW_QA_AWAY=1 node qa/back-after-gap.mjs
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { sandbox } from './sandbox-lib.mjs'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const dbs = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? dbs(path) : name === 'mindflow.db' ? [path] : []
})
const rows = (h) => h.evaluate(() => [...document.querySelectorAll('nav [data-side-row]')].map((row) => row.textContent.trim()).filter((t) => t && !['Tasks', 'Saved'].includes(t)))

// A first run, to lay the sandbox down; then every open is moved ten days back.
let c = await sandbox({ width: 1100, height: 800 })
const before = await rows(c.h)
await c.close()
for (const file of dbs(process.env.QA_DATA)) {
  const db = new DatabaseSync(file)
  try { db.exec("update app_opens set opened_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 days')") } catch {}
  db.close()
}
c = await sandbox({ width: 1100, height: 800 })
const { h } = c
try {
  await h.waitForTimeout(1500)
  const quiet = await rows(h)
  const note = await h.evaluate(() => document.querySelector('[data-quiet-return]')?.textContent ?? '')
  check('after 10 days away the sidebar holds only capture and Today', quiet.length === 2 && quiet.some((r) => r.startsWith('Inbox')) && quiet.some((r) => r.startsWith('Today')), quiet.join(' | '))
  check('it says so plainly, with a way to show everything', /Welcome back after 10 days/.test(note), note)
  check('and it opens on Today', await h.evaluate(() => /Today/.test(document.querySelector('h1')?.textContent ?? '')))
  await h.getByRole('button', { name: 'Show everything' }).click(); await h.waitForTimeout(1200)
  const all = await rows(h)
  check('"Show everything" brings the rest back', all.length >= before.length - 1 && all.length > 2, `${all.length} rows, ${before.length} before`)
  check('the note is gone with it', !(await h.evaluate(() => !!document.querySelector('[data-quiet-return]'))))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
