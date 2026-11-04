// ⌘/ in quick capture: the shortcuts list opens in the main window, never as a dark box the size of the capture
// window floating over the desktop (the user's ⌘/ from the pill on a painting).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/capture-shortcuts.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, h } = c
const wait = (ms) => page.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? '/tmp'
await page.evaluate(() => window.api.showPrompt()); await wait(1400)
await page.click('.tiptap.ProseMirror'); await wait(200)
await page.keyboard.press('Meta+Slash'); await wait(1200)
const inBox = await page.evaluate(() => !!document.querySelector('[role=dialog][aria-label="Keyboard shortcuts"]'))
const inMain = await h.evaluate(() => !!document.querySelector('[role=dialog][aria-label="Keyboard shortcuts"]'))
await c.both(`${shots}/capture-shortcuts-main`)
check('⌘/ in quick capture: no shortcuts box drawn in the capture window', !inBox)
check('…the list opens in the main window instead', inMain)
done()
await c.close?.()
