// Back from the sandbox, what you do in your book is saved in your book: a goal
// put on ice and another moved to the Bin are still so after a restart, read
// from the book's own file. The user put "learn Spanish" on ice and in the Bin
// again and again after leaving the sandbox, and it kept coming back.
//
// As `npm run dev` runs it, the run you started from stays up (with its book
// open) while every later run starts and ends beside it, so the run that went
// into the sandbox is kept up here too.
//
//   npx electron-vite build --outDir out-sv && QA_ENTRY=$PWD/out-sv/main/index.js HALIGTREE_QA_AWAY=1 node qa/after-sandbox-saves.mjs
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const root = mkdtempSync(join(tmpdir(), 'haligtree-after-sandbox-'))
process.env.QA_DATA = root
const { check, done } = checks()
const launch = (args) => ((process.env.QA_ARGS = args), sandbox({ seeded: false }))
// A restart is only noted, never started: each run here is opened by the probe.
const stub = (c) => c.electron.evaluate(({ app }) => {
  globalThis.__relaunched = null
  const children = process.mainModule.require('child_process')
  const spawn = children.spawn
  children.spawn = (command, args, ...rest) => (args ?? []).some((one) => String(one).endsWith('index.js')) || command === process.execPath
    ? (globalThis.__relaunched = args ?? [], { unref() {}, on() {}, kill() {} })
    : spawn.call(children, command, args, ...rest)
  app.relaunch = (options) => void (globalThis.__relaunched = options?.args ?? [])
  app.exit = () => void (globalThis.__quit = true)
})
const relaunched = async (c) => {
  for (let i = 0; i < 40 && !(await c.electron.evaluate(() => globalThis.__relaunched)); i++) await c.h.waitForTimeout(100)
  return c.electron.evaluate(() => globalThis.__relaunched)
}
const kept = []
let book, iced, binned
try {
  // 1. A book of your own, and two goals in it.
  {
    const c = await launch('')
    kept.push(c)
    book = await c.v('books:create', 'Garden of Loose Ends')
    await c.v('books:last', book)
    await c.close()
  }
  // 2. The run you started from: into the book, the goals made, then into the sandbox. Kept up, as `npm run dev` keeps it.
  const first = await launch('')
  kept.push(first)
  check('the book opens', (await first.v('books:list')).current === book)
  iced = await first.v('goal:new', 'learn Spanish', null, null, null)
  binned = await first.v('goal:new', 'Learn Muay Thai', null, null, null)
  check('two goals made', !!iced && !!binned)
  await stub(first)
  await first.v('sandbox:enter', { local: {}, settings: {} })
  check('into the sandbox', String(await relaunched(first)).includes('--sandbox'))
  // 3. The sandbox, then Back to my notes.
  {
    const c = await launch('--sandbox')
    kept.push(c)
    check('the sandbox is the sandbox', (await c.v('sandbox:state')).on)
    await stub(c)
    await c.v('books:bars', book)
    await c.v('books:last', book)
    await c.v('sandbox:leave')
    check('back to my notes', !String(await relaunched(c)).includes('--sandbox'))
    await c.close()
  }
  // 4. Back in the book: one goal on ice, the other to the Bin.
  {
    const c = await launch('')
    kept.push(c)
    check('back in the same book', (await c.v('books:list')).current === book)
    check('put on ice', (await c.v('goal:close', iced, 'on ice')) === true)
    await c.v('bin:put', binned)
    const goals = await c.v('items', 'goal')
    check('this run sees it on ice and in the Bin', !goals.some((one) => one.id === binned) && !!(await c.v('item', iced))?.closedAt, JSON.stringify(goals.map((one) => one.title)))
    await c.h.waitForTimeout(800)
    await c.close()
  }
  await first.close()
  // 5. Read from the book's own file, as the next start would.
  const file = join(root, 'books', book, 'haligtree.db')
  const db = new DatabaseSync(file, { readOnly: true })
  const row = (id) => db.prepare('select title, closed_at as closedAt, closed_how as closedHow, binned_at as binnedAt from nuggets where id = ?').get(id)
  const a = row(iced)
  const b = row(binned)
  db.close()
  check('the file says "learn Spanish" is on ice', a?.closedHow === 'on ice' && !!a.closedAt, JSON.stringify(a))
  check('the file says "Learn Muay Thai" is in the Bin', !!b?.binnedAt, JSON.stringify(b))
} catch (error) {
  check('ran to the end', false, error?.stack ?? String(error))
} finally {
  for (const c of kept) await c.close().catch(() => {})
  rmSync(root, { recursive: true, force: true })
}
done()
