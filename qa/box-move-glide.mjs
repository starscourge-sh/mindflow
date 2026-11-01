// Quick capture moved while it is still gliding to a new size (dragged by hand, or put somewhere by main), then put
// away and opened again: it comes back where it was moved to, never where it was before the move. The glide used to
// keep its old place as its target, and putting the box away landed it there.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/box-move-glide.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
// Each window keeps the place it is given as its own while parked off screen, so the box can be moved.
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, v } = c
const wait = (ms) => page.waitForTimeout(ms)
const at = () => c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html')).getBounds())
const move = (x, y) => c.electron.evaluate(({ BrowserWindow }, [x, y]) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().includes('/index.html')).setPosition(x, y), [x, y])
const reopen = async () => {
  await page.evaluate(() => window.api.hidePrompt()); await wait(500)
  await page.evaluate(() => window.api.showPrompt()); await wait(1400)
}
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, motion: true, boxPlace: 'last', boxScreen: 'same' })
  await reopen()
  if (await page.$('[aria-label="Hide the side panel"]')) { await page.keyboard.press('Meta+Backslash'); await wait(1000) }
  await reopen()
  for (const round of [1, 2, 3]) {
    const start = await at()
    // A glide to full height, and the box moved while it is still on its way.
    await page.evaluate(() => window.api.fitBox(600))
    let mid = await at()
    for (let i = 0; i < 20 && mid.height === start.height; i++) { await wait(10); mid = await at() }
    const to = { x: start.x + (round % 2 ? 160 : -160), y: start.y + 90 * (round % 2 ? 1 : -1) }
    await move(to.x, to.y)
    const gliding = mid.height > start.height && mid.height < 600
    await page.evaluate(() => window.api.hidePrompt()); await wait(500)
    await page.evaluate(() => window.api.showPrompt()); await wait(1400)
    const back = await at()
    check(`round ${round}: moved mid-glide (${start.height}px on its way to 600px, ${mid.height}px when moved)`, gliding, JSON.stringify({ start, mid }))
    check(`round ${round}: put away and opened again, it is where it was moved to`, back.x === to.x && back.y === to.y, JSON.stringify({ to, back }))
    // Back to its short size for the next round.
    await page.evaluate(() => window.api.fitBox(280, true)); await wait(400)
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
