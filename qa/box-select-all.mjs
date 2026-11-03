// Quick capture's ⌘A and ⌫ on the Inbox beside it only while that list is the one in front: the pointer over it, or
// the keys last in it, and the panel on screen. With the keys anywhere else (out of the writing after a Tab, say),
// ⌘A picked the whole Inbox out of sight ("48 selected") and ⌫ sent it all to the Bin with the tearing sound (the
// tracker: "why am i even able to cmd + all, which does not visually do anything... it plays the big paper rip").
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-select-all.mjs
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page } = c
const wait = (ms) => page.waitForTimeout(ms)
const binned = () => page.evaluate(async () => (await window.api.captures.list()).filter((one) => one.status === 'discarded').length)
const said = () => page.evaluate(() => document.body.innerText.match(/\d+ selected[^\n]*/)?.[0] ?? '')
const heard = () => page.evaluate(() => [...(window.haligtreeHeard ?? [])])
try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: true, boxOneLine: false })
  await page.evaluate(() => window.api.showPrompt())
  await wait(1300)
  if (!(await page.locator('[aria-label="Hide the side panel"]').count())) await page.locator('[aria-label="Show the side panel"]').click()
  await wait(900)
  const before = await binned()
  // Written in, then the keys leave the writing for no list (a Tab past the definition ends on the page itself).
  const editor = page.locator('.tiptap.ProseMirror[contenteditable="true"]').first()
  await editor.click()
  await page.keyboard.type('run')
  await page.evaluate(() => document.activeElement?.blur())
  await page.mouse.move(200, 300)
  await page.keyboard.press('Meta+a')
  await wait(300)
  check('⌘A with the keys outside the Inbox picks nothing there', !(await said()), await said())
  await page.keyboard.press('Backspace')
  await wait(900)
  check('and ⌫ sends nothing to the Bin', (await binned()) === before, `${before} → ${await binned()}`)
  check('with no tearing sound', !(await heard()).includes('tear'), JSON.stringify(await heard()))
  // Pointed at, the Inbox takes ⌘A as Finder does; Esc lets them go.
  const panel = await page.locator('[data-box-panel]').boundingBox()
  await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height / 2)
  await page.keyboard.press('Meta+a')
  await wait(400)
  check('⌘A with the pointer over the Inbox picks every row', /\d+ selected/.test(await said()), await said())
  await page.keyboard.press('Escape')
  await wait(400)
  // The Saved tab's gems, the same, once the notice before has gone.
  for (let i = 0; i < 40 && (await said()); i++) await wait(250)
  await page.getByRole('tab', { name: /Saved/ }).click()
  await wait(800)
  await editor.click()
  await page.evaluate(() => document.activeElement?.blur())
  await page.mouse.move(200, 300)
  await page.keyboard.press('Meta+a')
  await wait(300)
  check('Saved: ⌘A with the keys outside picks nothing', !(await said()), await said())
  const panel2 = await page.locator('[data-box-panel]').boundingBox()
  await page.mouse.move(panel2.x + panel2.width / 2, panel2.y + panel2.height * 0.6)
  await page.keyboard.press('Meta+a')
  await wait(400)
  check('Saved: ⌘A with the pointer over the gems picks them', /\d+ selected/.test(await said()), await said())
  await page.keyboard.press('Escape')
  await wait(300)
  check('nothing went to the Bin through it all', (await binned()) === before, `${before} → ${await binned()}`)
} finally {
  await c.close()
}
done()
