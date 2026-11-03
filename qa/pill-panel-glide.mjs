// "One line to start": ⌘\ grows the pill into the box with its panel, and ⌘\ again folds it back, each in one glide,
// width and height moving together. Folding back used to narrow the box at its full-box height first (a large empty
// card holding one line) and only then shrink it to the pill in a second glide (the tracker: "moving from oneliner
// prompt to cmd+\ looks like absolutely glitchy, formless"). The card's size is read in main every few ms.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/pill-panel-glide.mjs
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, electron } = c
const BOX = page.url()
const wait = (ms) => page.waitForTimeout(ms)
const watch = () => electron.evaluate(({ BrowserWindow }, url) => {
  const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === url)
  globalThis.qaSizes = []
  clearInterval(globalThis.qaSizeTimer)
  globalThis.qaSizeTimer = setInterval(() => { const b = win.getBounds(); globalThis.qaSizes.push([b.width, b.height]) }, 4)
}, BOX)
const seen = () => electron.evaluate(() => (clearInterval(globalThis.qaSizeTimer), globalThis.qaSizes))
// Each step's share of the way, in width and in height: in one glide the two keep within a step or two of each other.
const together = (sizes) => {
  const [w0, h0] = sizes[0]
  const [w1, h1] = sizes.at(-1)
  let worst = 0
  for (const [w, h] of sizes) {
    const kw = w1 === w0 ? 1 : (w - w0) / (w1 - w0)
    const kh = h1 === h0 ? 1 : (h - h0) / (h1 - h0)
    worst = Math.max(worst, Math.abs(kw - kh))
  }
  return Math.round(worst * 100) / 100
}
const steps = (sizes) => sizes.filter((one, i) => i === 0 || one[0] !== sizes[i - 1][0] || one[1] !== sizes[i - 1][1]).map(([w, h]) => `${w}x${h}`)
try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true, motion: true })
  for (const look of ['dark', 'light']) {
    await c.look(look)
    await page.evaluate(() => window.api.showPrompt())
    await wait(1300)
    await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
    await page.keyboard.type('remember to call the bank')
    await wait(900)
    for (const way of ['open', 'fold back']) {
      await watch()
      await page.keyboard.press('Meta+Backslash')
      await wait(1400)
      const sizes = await seen()
      const shape = steps(sizes)
      const gap = together(sizes)
      check(`${look} ${way}: one glide, width and height together (worst gap ${gap})`, gap <= 0.25 && sizes.length > 0, shape.join(' '))
      if (way === 'fold back') check(`${look}: back to the one-line pill`, sizes.at(-1)[1] <= 70, shape.at(-1))
    }
    await page.evaluate(() => window.api.hidePrompt())
    await wait(500)
  }
} finally {
  await c.close()
}
done()
