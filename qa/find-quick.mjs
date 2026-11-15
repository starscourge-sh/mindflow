// ↵ and ⌥↵ pressed straight after typing in a note's find bar act on what was typed (U2, 15 Nov 2026: inside the
// extension's 250 ms wait the bar read the old, empty count and gave a miss's sound, so nothing was found or
// replaced). A fresh bar: "fox" typed and ↵ at once goes to the first fox; then, "wolf" waiting in the replace
// field, "fox" typed again and ⌥↵ at once replaces every fox.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/find-quick.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { h, v, send } = c
const PAGE_EDITOR = '[class*="@container/page"] .tiptap.ProseMirror'
const words = () => h.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', PAGE_EDITOR)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const made = await h.evaluate(() => window.api.captures.create({ body: 'The fox saw another fox by the fox den.' }))
  await send('capture', made.id)
  await h.waitForTimeout(1500)
  await h.locator(PAGE_EDITOR).first().click()

  // 1. ↵ straight after typing.
  await h.keyboard.press('Meta+f')
  await h.waitForTimeout(500)
  const find = h.locator('input[aria-label="Find in note"]')
  await find.pressSequentially('fox', { delay: 5 })
  await find.press('Enter')
  await h.waitForTimeout(150)
  check('↵ straight after typing goes to the first match', (await h.locator(`${PAGE_EDITOR} .find-and-replace-result-current`).count()) === 1)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)

  // 2. ⌥↵ straight after typing, the replacement already waiting.
  await h.locator(PAGE_EDITOR).first().click()
  await h.keyboard.press('Alt+Meta+f')
  await h.waitForTimeout(500)
  const replace = h.locator('input[placeholder="Replace with"]')
  await find.fill('')
  await h.waitForTimeout(400)
  await replace.fill('wolf')
  await find.pressSequentially('fox', { delay: 5 })
  await replace.press('Alt+Enter')
  await h.waitForTimeout(600)
  const after = await words()
  check('⌥↵ straight after typing replaces every match', after.includes('The wolf saw another wolf by the wolf den.'), after)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
