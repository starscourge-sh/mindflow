// Quick capture's real glass (native/glass.mm) stays under the card and its round controls when the window grows
// room below for a list (/, # and @ in the one-line pill) and when it gives the room back: the glass is the window's
// size and its mask was drawn for that size, never one drawn for the old size and stretched. Stretched, the blurred
// shapes slid down and grew tall, away from the card, as dim ovals under the list (the user's 37630f74, 4f19f8eb,
// e477ae76). Dark and light.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/glass-grow.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { CALM_HOUR, sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760, at: CALM_HOUR })
const { page, electron } = c
const BOX = page.url()
const NODE = join(process.cwd(), 'resources/glass.node')
const wait = (ms) => page.waitForTimeout(ms)
// [glass width, height, mask width, height, window width, height]
const frame = () => electron.evaluate(({ BrowserWindow }, [url, file]) => {
  const module = { exports: {} }
  process.dlopen(module, file)
  const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL() === url)
  return module.exports.glassFrame?.(win.getNativeWindowHandle()) ?? null
}, [BOX, NODE])
const fits = (f) => !!f && Math.abs(f[0] - f[2]) < 1 && Math.abs(f[1] - f[3]) < 1 && Math.abs(f[1] - f[5]) < 1 && Math.abs(f[0] - f[4]) < 1
try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false, boxOneLine: true })
  for (const look of ['dark', 'light']) {
    await c.look(look)
    await page.evaluate(() => window.api.showPrompt())
    await wait(1300)
    const opened = await frame()
    check(`${look}: glass under the pill, its mask the window's size`, fits(opened), JSON.stringify(opened))
    for (const key of ['/', '#', '@']) {
      await page.keyboard.type(key)
      await wait(700)
      const grown = await frame()
      check(`${look} ${key}: window grew room below (${opened?.[5]} to ${grown?.[5]}), glass and mask grew with it, not stretched`, fits(grown) && grown[5] > opened[5], JSON.stringify(grown))
      await page.keyboard.press('Escape')
      await page.keyboard.press('Backspace')
      await wait(700)
      const back = await frame()
      check(`${look} ${key}: room given back, glass and mask back to the window's size`, fits(back), JSON.stringify(back))
    }
    await page.evaluate(() => window.api.hidePrompt())
    await wait(500)
  }
} finally {
  await c.close()
}
done()
