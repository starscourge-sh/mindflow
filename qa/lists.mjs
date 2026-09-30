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

test('children survive a conversion and stay children', async (app) => {
  await app.type(['- parent', 'child'])
  await app.press('Tab')
  await app.press('Enter')
  await app.type(['second child'])
  await app.line(0)
  await app.press(TASK)
  return app.shape()
})

test('pressing again ticks the boxes instead of unwrapping the list', async (app) => {
  await app.type(['- one', 'two'])
  await app.line(0)
  await app.press('Shift+ArrowDown', 'Shift+End')
  await app.press(TASK)
  await app.press(TASK)
  return app.shape()
})

test('a parent with children converts, then ticks, keeping the children', async (app) => {
  await app.type(['- parent', 'child'])
  await app.press('Tab')
  await app.line(0)
  await app.press(TASK)
  await app.press(TASK)
  return app.shape()
})

test('a selection covering a parent and its children converts both levels', async (app) => {
  await app.type(['- parent', 'child one'])
  await app.press('Tab')
  await app.press('Enter')
  await app.type(['child two'])
  await app.line(0)
  await app.press('Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+End')
  await app.press(TASK)
  return app.shape()
})

test('ticking twice unticks', async (app) => {
  await app.type(['- one', 'two'])
  await app.line(0)
  await app.press('Shift+ArrowDown', 'Shift+End')
  await app.press(TASK, TASK, TASK)
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
