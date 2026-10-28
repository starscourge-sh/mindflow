// Your own goal cards through a visit to the sandbox: one card up, one tucked away (a now-and-then goal waiting for its
// moment). Into the sandbox, neither shows: only the sandbox's own cards. "Back
// to my notes" brings the one that was up back exactly where it was, and the
// tucked one stays tucked: coming back is not a new opening of the day.
//
// Each switch starts a new run of the app (src/main/sandbox.ts relaunch), which
// the test does not drive: every sticky a run shows is written down by the app
// itself (HALIGTREE_QA_TRACE, with its place), and that is what is read. The
// run into the sandbox is driven by hand from your book; the run out of it from
// a sandbox opened by the test, on the same data folder.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/sandbox-stickies-return.mjs
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { execSync } from 'child_process'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'os'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const ENTRY = process.env.QA_ENTRY
const TRACE = mkdtempSync(join(tmpdir(), 'haligtree-trace-'))
process.env.HALIGTREE_QA_TRACE = TRACE
const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const read = () => (existsSync(`${TRACE}/trace.jsonl`) ? readFileSync(`${TRACE}/trace.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((one) => JSON.parse(one)) : [])
/** Until `ok` holds of the trace, or `ms` pass. */
const until = async (ok, ms) => {
  for (const end = Date.now() + ms; Date.now() < end && !ok(read()); ) await wait(250)
  return read()
}
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }
// The runs the switches started are the old run's children, not the test's: ended by their address.
const endRuns = () => { try { execSync(`pkill -f "${ENTRY} .*--show-home"`) } catch {} }
/** Your book's stickies as it keeps them (stickies.json in its folder), by goal: where each rests. */
const kept = () => { try { return JSON.parse(readFileSync(join(process.env.QA_DATA, 'stickies.json'), 'utf8')) } catch { return [] } }
/** The sandbox has finished setting out its examples (its own book says so): a run ended before then is set out again from nothing on its next start. */
const seeded = () => {
  try {
    const db = new DatabaseSync(join(process.env.QA_DATA, 'sandbox', 'haligtree.db'), { readOnly: true })
    try { return !!db.prepare("select 1 from settings where key = 'sandboxSeededAt'").get() } finally { db.close() }
  } catch { return false }
}
const day = (days) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10)

let up = null
let tucked = null
let rest = null
try {
  // 1. Your own book: the welcome left for an empty book, then two goals, one card up, one tucked.
  delete process.env.QA_ARGS
  const c = await sandbox({ width: 1100, height: 760, seeded: false })
  const { h, v, electron } = c
  const realPid = c.electron.process().pid
  try {
    if (await h.waitForSelector('.mf-welcome', { timeout: 8000 }).then(() => true, () => false)) {
      await h.click('.mf-welcome footer button:has-text("Skip the welcome")')
      await h.waitForSelector('.mf-welcome [data-choice="2"]', { timeout: 15000 })
      await h.waitForTimeout(800)
      await h.keyboard.press('1')
      await h.waitForSelector('.mf-welcome', { state: 'detached', timeout: 15000 })
    }
    // The tucked one first, a minute before the other: goals made within a minute of each other came in together
    // (an import) and share one sticky instead of a card each (BULK_MS in src/main/index.ts).
    tucked = await v('goal:new', 'Learn Italian', day(200))
    await v('goal:beacon:set', tucked, 'sometimes')
    await wait(61_000)
    up = await v('goal:new', 'Run a marathon', day(120))
    await v('goal:beacon:set', up, 'always')
    const cards = () => electron.evaluate(({ BrowserWindow }, ids) => Object.fromEntries(ids.map((id) => {
      const w = BrowserWindow.getAllWindows().find((one) => !one.isDestroyed() && /[?&]view=sticky/.test(one.webContents.getURL()) && one.webContents.getURL().includes(`id=${id}`))
      return [id, w ? { shown: w.isVisible(), bounds: w.getBounds() } : null]
    })), [up, tucked])
    for (let i = 0; i < 40 && !(await cards())[up]?.shown; i++) await wait(250)
    await wait(1200)
    const before = await cards()
    // Its place as your book keeps it (stickies.json): the window itself may be moved by a window manager in a test run.
    rest = kept().find((one) => one.id === up)?.bounds
    check('your book: the marathon card is up, its place kept', !!before[up]?.shown && !!rest, `${JSON.stringify(before[up])} kept ${JSON.stringify(kept())}`)
    check('your book: the Italian card is tucked away, waiting for its moment', !before[tucked]?.shown, JSON.stringify(before[tucked]))

    // 2. Into the sandbox, from your book's own way in.
    const asked = Date.now()
    await v('sandbox:enter', null).catch(() => {})
    const into = await until((all) => all.some((one) => one.sandbox && one.name === 'home'), 40000)
    check('the sandbox comes up', into.some((one) => one.sandbox && one.name === 'home'))
    for (let i = 0; i < 80 && alive(realPid); i++) await wait(250)
    check('your book\'s run ends once the sandbox is up, its cards with it', !alive(realPid))
    // Its own cards (Dune's goal, Today) have time to come.
    await until((all) => all.filter((one) => one.sandbox && one.name.startsWith('sticky')).length >= 2, 15000)
    await wait(2000)
    const there = read().filter((one) => one.sandbox && one.name.startsWith('sticky'))
    check('in the sandbox, neither of your cards shows', !there.some((one) => [up, tucked].some((id) => (one.key ?? '').endsWith(id))), JSON.stringify(there.map((one) => one.key)))
    check('the sandbox shows its own cards', there.length >= 1, `${there.length} cards, ${Date.now() - asked}ms`)
    for (let i = 0; i < 120 && !seeded(); i++) await wait(250)
    check('the sandbox finishes setting out its examples', seeded())
  } finally {
    await c.close()
  }
  endRuns()
  await wait(1500)

  // 3. Back to my notes, from the sandbox (opened again on the same data, already set out).
  process.env.QA_ARGS = '--sandbox'
  const s = await sandbox({ width: 1100, height: 760 })
  const mark = read().length
  try {
    await s.v('sandbox:leave').catch(() => {})
    const back = await until((all) => all.slice(mark).some((one) => !one.sandbox && one.name === 'home'), 40000)
    check('"Back to my notes" opens your book again', back.slice(mark).some((one) => !one.sandbox && one.name === 'home'))
    // Your cards have time to come, and the tucked one to show if it wrongly would.
    await until((all) => all.slice(mark).some((one) => !one.sandbox && (one.key ?? '').endsWith(up)), 15000)
    await wait(5000)
    const mine = read().slice(mark).filter((one) => !one.sandbox && one.name.startsWith('sticky'))
    const card = mine.find((one) => (one.key ?? '').endsWith(up))
    check('the marathon card is back', !!card, JSON.stringify(mine.map((one) => one.key)))
    console.log(`  kept after: ${JSON.stringify(kept())}`)
    check('exactly where it was', !!card && !!rest && card.bounds.x === rest.x && card.bounds.y === rest.y && card.bounds.width === rest.width && card.bounds.height === rest.height, `${JSON.stringify(card?.bounds)} vs ${JSON.stringify(rest)}`)
    check('the Italian card is still tucked away', !mine.some((one) => (one.key ?? '').endsWith(tucked)), JSON.stringify(mine.map((one) => one.key)))
    check('each shown once', new Set(mine.map((one) => one.key)).size === mine.length, JSON.stringify(mine.map((one) => one.key)))
  } finally {
    await s.close()
  }
} catch (error) {
  check('ran', false, error.stack)
} finally {
  endRuns()
  rmSync(TRACE, { recursive: true, force: true })
}
done()
