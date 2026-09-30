/**
 * What a list does when asked to become another kind of list.
 * Each case prints the document shape; a failure reads as a wrong shape.
 */
import { open } from './harness.mjs'

const TASK = 'Meta+Alt+Digit4'
const BULLET = 'Meta+Alt+Digit5'

const cases = []
const test = (name, run) => cases.push({ name, run })

test('one of three bullets becomes a checkbox', async (app) => {
  await app.type(['- one', 'two', 'three'])
  await app.line(0)
  await app.press(TASK)
  return app.shape()
})

test('three selected bullets all become checkboxes', async (app) => {
  await app.type(['- one', 'two', 'three'])
  await app.line(0)
  await app.press('Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+End')
  await app.press(TASK)
  return app.shape()
})

test('a half-converted run finishes converting', async (app) => {
  await app.type(['- one', 'two', 'three'])
  await app.line(0)
  await app.press(TASK)
  await app.line(0)
  await app.press('Shift+ArrowDown', 'Shift+End')
  await app.press(TASK)
  return app.shape()
})

test('the caret stays on the line that was converted', async (app) => {
  await app.type(['- one', 'two', 'three'])
  await app.line(1)
  await app.press(TASK)
  return `caret on: ${await app.caretLine()}`
})

test('checkboxes turn back into bullets', async (app) => {
  await app.type(['- one', 'two'])
  await app.line(0)
  await app.press('Shift+ArrowDown', 'Shift+End')
  await app.press(TASK)
  await app.press(BULLET)
  return app.shape()
})

const app = await open()
for (const { name, run } of cases) {
  await app.reset()
  let out
  try { out = await run(app) } catch (error) { out = `THREW: ${error.message}` }
  console.log(`\n=== ${name}\n${out}`)
}
await app.close()
process.exit(0)
