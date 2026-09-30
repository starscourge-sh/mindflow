/**
 * Dragging a block further than the window is tall.
 *
 * The gesture is to hold at the edge and wait, so the check is that holding
 * still scrolls - an autoscroll driven by pointer movement stops the moment
 * you stop moving, which is exactly when you need it.
 */
import { open } from './harness.mjs'

const app = await open()
await app.reset()
await app.type(Array.from({ length: 40 }, (_, i) => `line ${i + 1}`))
await app.page.$eval('.mindflow-editor-content', (box) => (box.scrollTop = 0))
await app.page.waitForTimeout(150)

await app.dragToEdge(0, { hold: 1800 })

const order = (await app.shape())
  .split('\n')
  .map((line) => line.match(/"(line \d+)"/)?.[1])
  .filter(Boolean)

console.log(`line 1 moved from 0 to ${order.indexOf('line 1')} of ${order.length}`)
console.log('first three now:', order.slice(0, 3).join(', '))
await app.close()
process.exit(0)
