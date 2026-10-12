// Undo puts back what was there: a thought sent from under a note comes back
// into its field with the caret at the end; a gem pinned and then put in the
// Bin comes back out pinned, and one archived comes back archived.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/undo-restores.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1180, height: 820 })
const { h, v, go } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })

try {
  // --- a thought under an open capture
  await go('inbox')
  await h.locator('[data-row]').first().click()
  await h.waitForTimeout(900)
  const field = h.locator('textarea[placeholder="Add a thought…"]').first()
  await field.click()
  await field.type('The tide was late again', { delay: 10 })
  await h.keyboard.press('Enter')
  await h.waitForFunction(() => /thought is kept/.test(document.body.innerText), null, { timeout: 4000 }).catch(() => {})
  check('a thought is kept, and the field empties', (await field.inputValue()) === '')
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(700)
  check('⌘Z puts the thought back in its field', (await field.inputValue()) === 'The tide was late again', JSON.stringify(await field.inputValue()))
  await h.keyboard.type(' today', { delay: 10 })
  check('with the caret at the end', (await field.inputValue()) === 'The tide was late again today', JSON.stringify(await field.inputValue()))
  await field.fill('')
  await h.keyboard.press('Escape')

  // --- the Bin keeps what a gem was
  const gems = await v('items', 'nugget').catch(() => null) ?? []
  const first = gems.find((one) => one.pinnedAt) ?? gems[0]
  const second = gems.find((one) => one !== first && !one.pinnedAt)
  if (first && second) {
    if (!first.pinnedAt) await v('pin', 'nuggets', first.id, true)
    await h.evaluate((id) => window.api.vigil('notes:archive', 'nuggets', [id], true), second.id)
    const before = (await v('items', 'nugget')).find((one) => one.id === first.id)
    await v('bin:put', first.id); await v('bin:put', second.id)
    await v('bin:restore', 'nugget', first.id); await v('bin:restore', 'nugget', second.id)
    const after = await h.evaluate(() => window.api.vigil('bin:list'))
    const all = (await v('items', 'nugget'))
    const one = all.find((x) => x.id === first.id)
    check('a gem out of the Bin is pinned again if it was', !!before?.pinnedAt && !!one?.pinnedAt, `before ${before?.pinnedAt} after ${one?.pinnedAt}`)
    check('a gem archived before the Bin is archived again', !!all.find((x) => x.id === second.id)?.archivedAt)
    check('neither is left in the Bin', !after.some((x) => x.id === first.id || x.id === second.id))
  } else check('sandbox has gems to try the Bin with', false)
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
