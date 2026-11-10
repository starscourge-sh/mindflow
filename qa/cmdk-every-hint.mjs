// Every action in ⌘K says what it does in the card beside the list: walked with the arrows through every action a
// few common words find, the card holds the action's icon, its name and a sentence under it, never the name alone
// (user: "New capture" left the card nearly empty). Its key, where it has one, sits under the sentence, not at the
// card's foot. Frames to SHOT, light and dark.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/cmdk-every-hint.mjs
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900, at: CALM_HOUR })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.SHOT
await v('settings:set', { sounds: false, hintRate: 0, motion: false })

try {
  await c.go('home'); await wait(1000)
  await h.keyboard.press('Meta+k'); await wait(700)
  const card = () => h.evaluate(() => {
    const panel = document.querySelector('[data-cmdk-panel]')
    const line = panel?.querySelector('[data-action-line]')
    const lit = document.querySelector('[data-search-at] [data-action-label]')?.textContent ?? null
    const head = line?.querySelector('p')?.getBoundingClientRect()
    const keys = line?.querySelector('[data-action-keys]')?.getBoundingClientRect()
    return { lit, name: line?.querySelector('p')?.textContent ?? null, said: line?.querySelector('[data-action-said]')?.textContent ?? '', icon: !!line?.querySelector('svg'), keysGap: keys && head ? Math.round(keys.top - head.bottom) : null, foot: !!panel?.querySelector(':scope > .border-t') }
  })
  // Before typing: the few first actions.
  const first = await h.evaluate(() => document.querySelectorAll('[data-action-label]').length)
  const seen = new Map()
  const walk = async (rows) => {
    for (let i = 0; i < rows; i++) {
      const one = await card()
      if (one.lit && !seen.has(one.lit)) seen.set(one.lit, one)
      await h.keyboard.press('ArrowDown'); await wait(60)
    }
  }
  await walk(first)
  if (shots) { await h.keyboard.press('Home'); await c.both(`${shots}/cmdk-new-capture`) }
  for (const words of ['new', 'turn', 'show', 'go to', 'import', 'close', 'theme', 'stick', 'study', 'open', 'hide', 'wrapped', 'fold', 'make']) {
    await h.locator('[role=dialog][aria-label=Search] input').first().fill(''); await h.keyboard.type(words, { delay: 15 }); await wait(700)
    const rows = await h.evaluate(() => document.querySelectorAll('[data-action-label]').length)
    await walk(rows)
  }
  const all = [...seen.values()]
  console.log(`  ${all.length} actions walked`)
  const bare = all.filter((one) => !one.said.trim())
  check('every action walked has a sentence under its name in the card', all.length > 40 && bare.length === 0, bare.map((one) => one.lit))
  check('every action card shows the action’s name', all.every((one) => one.name === one.lit), all.filter((one) => one.name !== one.lit).map((one) => [one.lit, one.name]))
  check('every action card has its icon', all.every((one) => one.icon), all.filter((one) => !one.icon).map((one) => one.lit))
  const keyed = all.filter((one) => one.keysGap != null)
  check('an action’s key sits under its sentence, near its name (under 80px), never at the card’s foot', keyed.length > 3 && keyed.every((one) => one.keysGap < 80 && !one.foot), keyed.map((one) => [one.lit, one.keysGap, one.foot]))
  const nc = seen.get('New capture')
  check('"New capture" says what it does', !!nc?.said && /capture/i.test(nc.said), nc?.said)
} finally {
  await c.close()
}
done()
