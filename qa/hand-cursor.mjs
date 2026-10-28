// The hand over every list's rows and the words in them, in Writing, Gems, the Inbox and the Bin, and over buttons;
// never over what is typed in.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/hand-cursor.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
try {
  await v('settings:set', { sounds: false, hintRate: 0, inboxDays: 0 })
  for (const view of ['articles', 'nuggets', 'inbox', 'discarded']) {
    await c.send('view', view); await h.waitForTimeout(1500)
    const got = await h.evaluate(() => {
      const row = document.querySelector('[data-pane] [data-row]')
      if (!row) return null
      const words = [...row.querySelectorAll('*')].find((one) => !one.children.length && one.textContent.trim())
      return { row: getComputedStyle(row).cursor, words: words && getComputedStyle(words).cursor }
    })
    check(`${view}: a row and its words show the hand`, got && got.row === 'pointer' && got.words === 'pointer', JSON.stringify(got))
  }
  const typed = await h.evaluate(() => { const one = document.querySelector('[data-pane] input, aside input'); return one ? getComputedStyle(one).cursor : 'none' })
  check('a field keeps its text cursor', typed !== 'pointer', typed)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
