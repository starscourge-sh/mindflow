// The week page shows the month's focus, and it can be written there: the same words as the month page's field.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/week-focus-edit.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900, seeded: false })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { hintRate: 0 })
  const now = new Date(); const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  await v('period:save', `month:${month}`, { fields: { focus: 'Finish the essay' } })
  await go('weekpage'); await wait(1500)
  const box = h.locator('[data-week-carried] textarea').first()
  check('the month focus shows as a field you can type in', (await box.count()) === 1 && (await box.inputValue()) === 'Finish the essay', String(await box.count()))
  await box.click(); await h.keyboard.press('End'); await h.keyboard.type(' and send it'); await h.keyboard.press('Tab'); await wait(800)
  const kept = await v('period', `month:${month}`)
  check('typed there, it is kept as the month page\'s focus', kept?.fields?.focus === 'Finish the essay and send it', JSON.stringify(kept?.fields))
} catch (e) { check('ran', false, e.message.split('\n')[0]) }
await close()
done()
