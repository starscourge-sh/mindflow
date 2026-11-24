// A daily copy can be opened and read. One note comes back into this book. Restoring never writes over it.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { sandbox } from './sandbox-lib.mjs'

const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1100, height: 800 })
const { h, v, go, both } = c
const fails = []
const check = (ok, name, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(got)}`}`); if (!ok) fails.push(name) }
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const where = String(await v('backups:where')).replace(/^~/, homedir())
  if (!where.includes('local.noindex')) throw new Error('refusing to write outside the sandbox copy')
  const planted = join(where, 'deleted books', 'Old notes 2020-01-01 b-abc12345')
  mkdirSync(planted, { recursive: true })
  writeFileSync(join(planted, 'haligtree.db'), 'kept')
  check(planted.endsWith('b-abc12345'), 'the old book sits with this run’s backups', planted)
  let copies = await v('snapshots:copy')
  // The sandbox copies the book once as it opens, before the example notes are laid down. A later copy is the book you can see.
  if (copies?.[0]?.notes === 0) {
    rmSync(join(where, 'database', `haligtree-${copies[0].day}.db`))
    copies = await v('snapshots:copy')
  }
  check(Array.isArray(copies) && copies.length >= 1 && copies[0].notes > 0, 'today’s copy says how many notes it held', copies?.[0])
  const day = copies?.[0]?.day
  const rows = day ? await v('snapshots:rows', day) : []
  check(rows.length > 0 && rows[0].title, 'opening a copy lists its notes', rows[0])
  const read = rows[0] ? await v('snapshots:read', day, rows[0].table, rows[0].id) : null
  check(!!read?.text, 'a note in the copy can be read', read?.title)
  const brought = rows[0] ? await v('snapshots:bring', day, rows[0].table, rows[0].id) : null
  check(!!brought?.id && brought.id !== rows[0].id, 'one note comes back as its own note', brought)
  const still = rows[0] ? await v('snapshots:read', day, rows[0].table, rows[0].id) : null
  check(still?.title === read?.title, 'the copy itself is unchanged', still?.title)
  const restored = await v('snapshots:restore', day)
  check(restored === null, 'restoring from the sandbox does not write a book over this one', restored)
  const removed = await v('deleted-books:list')
  check(!removed.some((one) => one.folder.includes('2020-01-01')), 'a deleted book older than 30 days is cleared', removed.map((one) => one.folder))
  const recent = 'Recent notes 2026-11-20 b-def67890'
  mkdirSync(join(planted, '..', recent), { recursive: true })
  writeFileSync(join(planted, '..', recent, 'note.txt'), 'still here')
  const listed = await v('deleted-books:list')
  const one = listed.find((book) => book.folder === recent)
  check(!!one && one.bytes > 0 && one.name === 'Recent notes', 'a recent deleted book shows its name and size', one)
  const back = await v('deleted-books:bring', recent)
  check(back === null, 'bringing a deleted book back from the sandbox does not write over this one', back)
  const dropped = await v('deleted-books:drop', recent)
  check(dropped === true, 'holding delete removes that copy for good', dropped)
  const after = await v('deleted-books:list')
  check(!after.some((book) => book.folder === recent), 'the removed copy is gone from the list', after)
  await go('settings')
  await h.locator('[data-section="Import and backups"]').click()
  await h.locator('[data-snapshots]').scrollIntoViewIfNeeded()
  await h.locator('[data-snapshot-open]').first().click()
  await h.waitForTimeout(300)
  const line = await h.locator('[data-snapshot]').first().innerText()
  check(/notes?/.test(line), 'Settings lists the copy', line.slice(0, 160))
  if (shots) await both(join(shots, 'snapshots'), h.locator('[data-snapshots]'))
} catch (error) {
  fails.push('threw: ' + error.message.split('\n')[0])
  console.log('threw', error.message.split('\n').slice(0, 8).join(' '))
} finally {
  await c.close()
}
console.log(fails.length ? `FAIL ${fails.length}: ${fails.join('; ')}` : 'PASS snapshots')
process.exit(fails.length ? 1 : 0)
