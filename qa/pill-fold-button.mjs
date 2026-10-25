// The folded session bubble's own buttons can be pressed where they are: with
// Time's up folded to a band ("+10 min", "Time's up"), pointing at "+10 min"
// leaves the bubble folded, so the button does not slide away under the
// pointer; a click adds ten minutes. Resting on the bubble itself still opens it.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pill-fold-button.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
const pillWindow = async () => {
  for (let i = 0; i < 50; i++) {
    const found = electron.windows().find((one) => one.url().includes('view=focus'))
    if (found) return found
    await wait(200)
  }
  throw new Error('no pill')
}
const island = (pill) => pill.$eval('[data-island]', (one) => one.getAttribute('data-island')).catch(() => null)
try {
  await electron.evaluate(({ ipcMain }) => { ipcMain.removeHandler('idle:seconds'); ipcMain.handle('idle:seconds', () => 0) })
  // Where the real pointer is, as the Mac says: played by the probe, so a test window off screen folds as a real one would when the pointer leaves.
  const pointerIn = (inside) => electron.evaluate(({ ipcMain }, on) => { ipcMain.removeHandler('focus:pointer'); ipcMain.handle('focus:pointer', () => on) }, inside)
  await pointerIn(false)
  await v('settings:set', { sounds: false, motion: true, countIn: false, focusShows: 'bubble', pillSits: 'free' })
  const task = (await v('tasks')).find((one) => one.status === 'open' && one.title)
  const id = await v('session:start', task.id, 'Fold test', 2500)
  await h.evaluate(() => window.api.showFocus(true))
  const pill = await pillWindow()
  await pill.waitForLoadState('domcontentloaded')
  await wait(5500)
  // Passed by once, Time's up folds to its band.
  await pointerIn(true); await pill.hover('[data-island]'); await wait(1200); await pointerIn(false); await pill.mouse.move(1, 1); await wait(3500)
  const folded = await island(pill)
  const button = pill.locator('[data-more-chip]').first()
  const had = await button.count()
  check('folded, the band shows its own "+10 min"', folded !== 'open' && had === 1, `${folded}, ${had}`)
  if (had) {
    await pointerIn(true)
    const at = await button.boundingBox()
    await pill.mouse.move(at.x + at.width / 2, at.y + at.height / 2, { steps: 4 })
    await wait(400)
    const moved = await button.boundingBox()
    check('pointing at it, the bubble stays folded', (await island(pill)) !== 'open', await island(pill))
    check('and the button stays under the pointer', Math.abs(moved.x - at.x) < 2 && Math.abs(moved.y - at.y) < 2, `${Math.round(at.x)},${Math.round(at.y)} -> ${Math.round(moved.x)},${Math.round(moved.y)}`)
    const before = (await v('focus:now')).plannedMs
    await pill.mouse.down(); await wait(60); await pill.mouse.up(); await wait(800)
    check('a click adds ten minutes', Math.abs(((await v('focus:now'))?.plannedMs ?? 0) - before - 600000) < 30000, `${before} -> ${(await v('focus:now'))?.plannedMs}`)
  }
  // Resting on the bubble, not a button, still opens it.
  await pill.mouse.move(1, 1); await wait(1500)
  const box = await pill.locator('[data-island]').boundingBox()
  await pill.mouse.move(box.x + 14, box.y + box.height / 2, { steps: 3 }); await wait(600)
  check('resting on the bubble itself opens it', (await island(pill)) === 'open', await island(pill))
  await v('session:cancel', id).catch(() => {})
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
