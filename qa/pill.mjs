// Start a timer and photograph the pill at rest, under the pointer, and when time is up.
import { open } from './harness.mjs'
const qa = await open()
const { electron, page } = qa
await page.evaluate(() => window.api.vigil('timer:start', 'ask for task 2', 6000))
await page.evaluate(() => window.api.showFocus(true))
await page.waitForTimeout(2500)
const pill = electron.windows().find((w) => w.url().includes('view=focus'))
if (!pill) { console.log('no pill', electron.windows().map((w) => w.url())); process.exit(1) }
const dir = process.env.SHOT
await pill.screenshot({ path: dir + '/pill-rest.png' })
await pill.hover('button >> nth=0'); await pill.waitForTimeout(300)
await pill.screenshot({ path: dir + '/pill-hover.png' })
await pill.mouse.move(0, 0); await pill.waitForTimeout(3000)
await pill.screenshot({ path: dir + '/pill-over.png' })
process.exit(0)
