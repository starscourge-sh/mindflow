// An everyday goal keeper moves a goal's day from its row, the Figma way: they
// press the "30 days" chip, drag right three steps, and watch the date beside it
// move three days as they go; nothing is saved until they let go, the row never
// opens or starts a drag under them, one save lands with a notice, and ⌘Z puts
// the day back.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/goal-date-scrub.mjs
//   or: qa/run-one.sh out-x goal-date-scrub
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const key = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Fri 1 Jan 2028", as the row writes a day. */
const full = (k) => { const [y, m, d] = k.split('-').map(Number); return `${DAY[new Date(y, m - 1, d).getDay()]} ${d} ${MON[m - 1]} ${y}` }

const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, v, go } = c
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const dayOf = async (id) => (await sql('select goal_at from nuggets where id = ?', id))[0]?.goal_at ?? null
try {
  await v('settings:set', { sounds: false })
  const id = await v('goal:new', 'Swim a mile', key(30), key(0))
  await go('goals')
  const row = `[data-row][data-type="goal"][data-id="${id}"]`
  const chip = h.locator(`${row} [data-goal-days] input`)
  const date = h.locator(`${row} [data-goal-day]`)
  await chip.waitFor({ timeout: 10_000 })
  check('the row shows its days as a chip: "30 days"', (await chip.inputValue()) === '30 days', await chip.inputValue())
  check('beside it, the date they land on', (await date.innerText()).trim() === full(key(30)), await date.innerText())

  // Press the chip and drag right, a little at a time, until it reads three days more (at most 80 small moves).
  const box = await chip.boundingBox()
  const y = box.y + box.height / 2
  let x = box.x + box.width / 2
  await h.mouse.move(x, y)
  await h.mouse.down()
  let shown = ''
  for (let i = 0; i < 80 && shown !== '33 days'; i++) {
    x += 2
    await h.mouse.move(x, y)
    shown = await chip.inputValue()
    if (/^(3[4-9]|[4-9]\d)/.test(shown)) break
  }
  check('dragged right, the chip steps to 33 days', shown === '33 days', shown)
  check('the date beside it moves three days as they drag', (await date.innerText()).trim() === full(key(33)), await date.innerText())
  check('nothing is saved while they still hold it', (await dayOf(id)) === key(30), await dayOf(id))
  await h.mouse.up()
  await h.waitForTimeout(600)
  check('let go: the goal\'s day is saved, three days later', (await dayOf(id)) === key(33), await dayOf(id))
  check('the row did not open the goal under the drag', !(await h.locator(`${row}[data-open]`).count()))
  check('one notice says the new day, with Undo', await h.getByText(`Now for ${full(key(33))}`).first().isVisible().catch(() => false))

  // ⌘Z takes it back.
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(600)
  check('⌘Z puts the day back', (await dayOf(id)) === key(30), await dayOf(id))
  check('and the chip says 30 days again', (await chip.inputValue()) === '30 days', await chip.inputValue())
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran to the end', false, String(error?.stack ?? error).slice(0, 400))
} finally {
  await c.close()
  done()
}
