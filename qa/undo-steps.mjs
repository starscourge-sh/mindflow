// ⌘Z steps back one change at a time (components/haligtree/ui.tsx Toaster): two rows sent to the Bin with two
// separate presses of ⌫, then ⌘Z twice, brings both back, the last first. A third ⌘Z brings back nothing else.
//   QA_DATA=<a copy of the seeded sandbox> QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/undo-steps.mjs
// LIST=articles (default) | tasks | inbox
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const LIST = process.env.LIST ?? 'articles'
const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go } = c
const wait = (ms) => h.waitForTimeout(ms)

const rows = () => h.evaluate(() => [...document.querySelectorAll('[data-id]')]
  .filter((el) => !el.closest('[data-side-row], [role="menu"], aside') && !el.querySelector('[data-id]') && el.getBoundingClientRect().height > 20 && el.getBoundingClientRect().top > 120 && el.getBoundingClientRect().bottom < 760)
  .map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.id, left: r.left, top: r.top, bottom: r.bottom, name: (el.innerText ?? '').split('\n').map((s) => s.trim()).find(Boolean)?.slice(0, 40) } }))
/** ⌫ on the row with the pointer resting on it, as a person does. */
const binByKey = async (row) => {
  await h.mouse.move(row.left + 80, row.top + 6); await h.mouse.move(row.left + 84, (row.top + row.bottom) / 2); await wait(300)
  await h.keyboard.press('Backspace'); await wait(1200)
}
const ids = async () => new Set((await rows()).map((row) => row.id))

try {
  await go(LIST); await wait(2500)
  const before = await rows()
  const [a, b] = [before[1], before[3]]
  check(`${LIST}: two rows to send to the Bin`, !!a && !!b, `${before.length} rows`)
  await binByKey(a)
  const mid = (await rows()).find((row) => row.id === b.id)
  await binByKey(mid ?? b)
  let now = await ids()
  check(`${LIST}: ⌫ on “${a.name}”, then ⌫ on “${b.name}”: both go`, !now.has(a.id) && !now.has(b.id), `${[a, b].filter((one) => now.has(one.id)).map((one) => one.name).join(', ') || 'neither'} still shown`)
  // Off the rows, so nothing is under the pointer for the keys.
  await h.mouse.move(1390, 890); await wait(300)
  await h.keyboard.press('Meta+z'); await wait(1500)
  now = await ids()
  check(`${LIST}: ⌘Z brings back the last one, “${b.name}”, and only it`, now.has(b.id) && !now.has(a.id), `“${b.name}” ${now.has(b.id) ? 'back' : 'not back'}, “${a.name}” ${now.has(a.id) ? 'back' : 'not back'}`)
  await h.keyboard.press('Meta+z'); await wait(1500)
  now = await ids()
  check(`${LIST}: a second ⌘Z brings back the first, “${a.name}”`, now.has(a.id) && now.has(b.id), `“${a.name}” ${now.has(a.id) ? 'back' : 'not back'}`)
  const all = before.every((row) => now.has(row.id))
  check(`${LIST}: every row is back as it was (${before.length})`, all, before.filter((row) => !now.has(row.id)).map((row) => row.name).join(', '))
  await h.keyboard.press('Meta+z'); await wait(1200)
  const after = await rows()
  check(`${LIST}: a third ⌘Z, with nothing left to take back, changes nothing`, after.length === before.length, `${after.length} rows, were ${before.length}`)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally { await c.close() }
done()
