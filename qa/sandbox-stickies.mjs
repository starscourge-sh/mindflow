// The sandbox's desktop after each way in: Dune's goal card and Today's list, one of each, never a copy.
// Counts the sticky windows on screen and the entries in stickies.json, by key, after:
//  - a first visit (the examples set out), with and without a welcome carried in (⌘K "Show the welcome (version 2)")
//  - coming back to an already set-out sandbox ("Back to my notes", then in again)
//  - Reset (the sandbox set out again from nothing)
//  - a reload while the examples go in (a dev build's hot reload, ⌘R): set out again from nothing, never twice over
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sandbox-stickies.mjs
// (QA_ARGS is set by the probe itself: each way in is its own launch, all on the one QA_DATA.)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const DATA = process.env.QA_DATA
const ROOT = join(DATA, 'sandbox')

/** One launch into the sandbox: wait for the examples and for the stickies to settle, then count both ways. */
async function visit(name, args, carry) {
  process.env.QA_ARGS = args
  if (carry) (mkdirSync(ROOT, { recursive: true }), writeFileSync(join(ROOT, 'carry.json'), JSON.stringify(carry)))
  const c = await sandbox({ width: 1100, height: 760 })
  try {
    // Stickies come out one after another; give them time to all be up.
    await c.h.waitForTimeout(5000)
    const windows = await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .filter((w) => !w.isDestroyed() && /[?&]view=sticky/.test(w.webContents.getURL()) && w.isVisible())
      .map((w) => { const u = new URL(w.webContents.getURL()); return `${u.searchParams.get('type')}:${u.searchParams.get('id')}` }))
    const file = join(ROOT, 'stickies.json')
    const listed = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).map((one) => `${one.type}:${one.id}`) : []
    const goals = windows.filter((key) => key.startsWith('goal:'))
    const todays = windows.filter((key) => key.startsWith('today:'))
    check(`${name}: one goal card and one Today list on the desktop`, goals.length === 1 && todays.length === 1, JSON.stringify(windows))
    const dunes = (await c.v('items', 'goal')).filter((goal) => /Dune/.test(goal.title)).length
    check(`${name}: the examples went in once (one Dune goal)`, dunes === 1, `${dunes}`)
    check(`${name}: no sticky window twice`, new Set(windows).size === windows.length, JSON.stringify(windows))
    check(`${name}: stickies.json lists each sticky once`, new Set(listed).size === listed.length, JSON.stringify(listed))
    check(`${name}: no page errors`, c.errors.length === 0, c.errors.join(' | '))
  } finally {
    await c.close()
  }
}

await visit('first visit', '--sandbox')
await visit('in again, already set out', '--sandbox')
await visit('in again with a welcome carried', '--sandbox', { local: {}, settings: {}, welcome: { version: 2, at: Date.now() } })
await visit('after Reset', '--sandbox --sandbox-reset')
// A reload while the examples go in: this run asks for a fresh sandbox and goes; the run it starts sets them out.
{
  process.env.QA_ARGS = '--sandbox --sandbox-reset'
  const c = await sandbox({ width: 1100, height: 760, seeded: false })
  const entry = process.env.QA_ENTRY
  let started = false
  try {
    for (let i = 0; i < 100 && !started; i++) (started = (await c.h.evaluate(() => window.api.captures.list().then((l) => l.length)).catch(() => 0)) > 20), await c.h.waitForTimeout(100)
    const gone = new Promise((done) => c.electron.process().once('exit', () => done(true)))
    await c.h.reload()
    const went = await Promise.race([gone, new Promise((done) => setTimeout(() => done(false), 20000))])
    check('a reload mid-seed: the run starts the sandbox over rather than seeding again', started && went, `started ${started}, went ${went}`)
  } finally {
    await c.close()
  }
  // The run it started is on its own: let it set the examples out (its database says when), then end it.
  const seeded = () => { try { return execFileSync('sqlite3', [join(ROOT, 'haligtree.db'), "select value from settings where key = 'sandboxSeededOn'"]).toString().trim() } catch { return '' } }
  await new Promise((done) => setTimeout(done, 3000))
  for (let i = 0; i < 180 && !seeded(); i++) await new Promise((done) => setTimeout(done, 500))
  check('a reload mid-seed: the new run sets the examples out', !!seeded())
  await new Promise((done) => setTimeout(done, 4000))
  try { execFileSync('pkill', ['-9', '-f', entry]) } catch {}
  await new Promise((done) => setTimeout(done, 1500))
}
await visit('after a reload mid-seed', '--sandbox')
await visit('first visit with a welcome carried', '--sandbox --sandbox-reset', { local: {}, settings: {}, welcome: { version: 2, at: Date.now() } })
const left = (() => { try { return execFileSync('pgrep', ['-f', process.env.QA_ENTRY]).toString().trim() } catch { return '' } })()
check('no test run left behind', !left, left)
done()
