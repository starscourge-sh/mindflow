// Send a note from the box with the panel open, and photograph the flight as it goes.
import { writeFileSync } from 'fs'
import { open } from './harness.mjs'
const qa = await open()
const { page } = qa
await page.keyboard.press('Meta+Backslash'); await page.waitForTimeout(900)
await qa.reset(); await qa.type(['A thought worth keeping', 'with a second line'])
// ⌥⌘↵ keeps the box open, so the flight can be watched.
await page.keyboard.press('Alt+Meta+Enter')
for (const at of [40, 160, 300, 480, 700]) {
  await page.waitForTimeout(at === 40 ? 40 : at - [40, 160, 300, 480, 700][[40, 160, 300, 480, 700].indexOf(at) - 1])
  const png = await qa.electron.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((w) => !/view=/.test(w.webContents.getURL()))
    return (await w.webContents.capturePage()).toPNG().toString('base64')
  })
  writeFileSync(`${process.env.SHOT}/fly-${at}.png`, Buffer.from(png, 'base64'))
}
process.exit(0)
