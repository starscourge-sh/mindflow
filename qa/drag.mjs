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

const app = await open()
for (const { name, run } of cases) {
  await app.reset()
  let out
  try { out = await run(app) } catch (error) { out = `THREW: ${error.message}` }
  console.log(`\n=== ${name}\n${out}`)
}
await app.close()
process.exit(0)
