// Every Inbox note at once to the Bin and back: ⌫ and ⌘Z on 95 rows, timed
// from the key to the list showing it, three times each.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-small/main/index.js HALIGTREE_QA_AWAY=1 node qa/bin-speed.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const ROOT = '[data-page="inbox"]'
const rows = () => h.evaluate((root) => [...new Set([...document.querySelectorAll(`${root} [data-row][data-id], ${root} [data-pick]`)].map((one) => one.dataset.id ?? one.dataset.pick))].filter(Boolean), ROOT)
/** Milliseconds from now until `done()` holds, read every 25ms, up to 10 seconds. */
const until = async (done) => {
  const t0 = Date.now()
  while (!(await done()) && Date.now() - t0 < 10000) await wait(25)
  return Date.now() - t0
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, countIn: false, inboxDays: 0 })
  await go('day'); await go('inbox'); await wait(600)
  const all = await rows()
  const openCount = () => h.evaluate(async () => (await window.api.captures.list()).filter((one) => one.status === 'open').length)
  const openBefore = await openCount()
  const outs = [], backs = []
  let picked = 0
  for (let round = 0; round < 3; round++) {
    const first = (await rows())[0]
    await h.locator(`${ROOT} [data-row][data-id="${first}"], ${ROOT} [data-pick="${first}"]`).first().click({ position: { x: 30, y: 10 } })
    await wait(300)
    await h.evaluate(() => document.activeElement?.closest?.('[contenteditable=true]') && document.activeElement.blur())
    await h.keyboard.press('Meta+a'); await wait(400)
    picked = Number((/(\d[\d,]*)\s*selected/.exec(await h.evaluate(() => document.body.innerText)) ?? [])[1] ?? 0)
    await h.keyboard.press('Backspace')
    outs.push(await until(async () => !(await rows()).includes(first)))
    await wait(1200)
    await h.keyboard.press('Meta+z')
    backs.push(await until(async () => (await rows()).includes(first)))
    await wait(1200)
    await h.keyboard.press('Escape'); await wait(300)
  }
  const back = await rows()
  const openAfter = await openCount()
  console.log(`  ${picked} picked; ⌫ ${outs.join(', ')} ms; ⌘Z ${backs.join(', ')} ms`)
  check('all of the Inbox is picked', picked >= 90, `${picked} picked`)
  check('every note is open again, as before', openAfter === openBefore, `${openAfter} of ${openBefore}`)
  check('every row on show came back', back.length === all.length, `${back.length} of ${all.length}`)
  check('⌫ on all of them shows within a second each time', outs.every((ms) => ms < 1000), outs.join(', '))
  check('⌘Z brings all of them back within a second each time', backs.every((ms) => ms < 1000), backs.join(', '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
  done()
}
