/** Moving a block by its handle. */
import { open } from './harness.mjs'

const cases = []
const test = (name, run) => cases.push({ name, run })

test('a paragraph moves below the one under it', async (app) => {
  await app.type(['alpha', 'beta', 'gamma'])
  await app.drag(0, 1)
  return app.shape()
})

test('a bullet moves within its list', async (app) => {
  await app.type(['- one', 'two', 'three'])
  await app.drag(0, 2)
  return app.shape()
})

test('a parent takes its children with it', async (app) => {
  await app.type(['- one', 'parent'])
  await app.press('Enter'); await app.press('Tab'); await app.type(['child'])
  await app.drag(1, 0)
  return app.shape()
})

test('a block moves to the very top', async (app) => {
  await app.type(['alpha', 'beta', 'gamma'])
  await app.drag(2, 0)
  return app.shape()
})

test('alt and a drag leaves the original behind', async (app) => {
  await app.type(['alpha', 'beta'])
  await app.drag(0, 1, { alt: true })
  return app.shape()
})

test('a checkbox keeps its tick when moved', async (app) => {
  await app.type(['- one', 'two'])
  await app.line(0)
  await app.press('Shift+ArrowDown', 'Shift+End', 'Meta+Alt+Digit4', 'Meta+Alt+Digit4')
  await app.drag(0, 1)
  return app.shape()
})

test('a list item in a callout can be reached and moved', async (app) => {
  const { page } = app
  const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  await page.$eval('.tiptap.ProseMirror.haligtree-editor:not(.is-line)', (root, items) =>
    root.editor.commands.setContent({ type: 'doc', content: [{ type: 'callout', content: [items[0],
      { type: 'bulletList', content: [{ type: 'listItem', content: [items[1]] }, { type: 'listItem', content: [items[2]] }] }] }] }),
    [p('intro'), p('one'), p('two')])
  await page.waitForTimeout(400)

  // Hover the first item, then travel left to its grip across the callout's
  // padding. The grip must still be the item's when the pointer gets there.
  const items = page.locator('li p')
  const one = await items.nth(0).boundingBox()
  await page.mouse.move(one.x + 40, one.y + one.height / 2, { steps: 5 })
  await page.waitForTimeout(200)
  const grip = await page.locator('.tiptap-drag-handle-grip').boundingBox()
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2, { steps: 25 })
  await page.waitForTimeout(200)
  const still = await page.locator('.tiptap-drag-handle-grip').boundingBox()
  if (Math.abs(still.y - grip.y) > 2) return `grip jumped from ${grip.y} to ${still.y}`

  const two = await items.nth(1).boundingBox()
  await page.mouse.move(still.x + still.width / 2 + 1, still.y + still.height / 2)
  await page.mouse.down()
  await page.mouse.move(two.x + 40, two.y + two.height * 0.8, { steps: 12 })
  await page.waitForTimeout(120)
  await page.mouse.up()
  await page.waitForTimeout(250)
  return app.shape()
})

const app = await open()
// Past the welcome: in it, a lone Enter on a one-line note sends the note,
// which took the first case's lines away before the drag.
await app.page.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))
await app.page.reload()
await app.page.waitForSelector('.tiptap.ProseMirror.haligtree-editor:not(.is-line)', { timeout: 15000 })
for (const { name, run } of cases) {
  await app.reset()
  let out
  try { out = await run(app) } catch (error) { out = `THREW: ${error.message}` }
  console.log(`\n=== ${name}\n${out}`)
}
await app.close()
process.exit(0)
