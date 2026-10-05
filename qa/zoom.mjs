// ⌘+ should make note text bigger, not zoom the whole window.
import { open } from './harness.mjs'
const qa = await open()
const { page, electron } = qa
await qa.reset(); await qa.type(['hello'])
const size = () => page.evaluate(() => getComputedStyle(document.querySelector('.tiptap')).fontSize)
const zoom = () => electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.webContents.getZoomLevel()).join(','))
console.log('before', await size(), await zoom())
await page.keyboard.press('Meta+Equal'); await page.waitForTimeout(400)
await page.keyboard.press('Meta+Equal'); await page.waitForTimeout(400)
console.log('after ⌘+', await size(), await zoom())
await page.keyboard.press('Meta+0'); await page.waitForTimeout(400)
console.log('after ⌘0', await size(), await zoom())
process.exit(0)
