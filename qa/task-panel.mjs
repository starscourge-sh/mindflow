// Open a task's panel in the main window at each interface size and photograph it.
import { open } from './harness.mjs'
const qa = await open()
const { electron, page } = qa
await page.evaluate(() => window.api.vigil('task:add', 'call the accountant today 3pm by friday !!'))
await page.waitForTimeout(1800)
await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home')); w?.setBounds({ width: 1200, height: 800 }); w?.show() })
const home = electron.windows().find((w) => w.url().includes('home'))
await home.waitForTimeout(600); await home.keyboard.press('Escape')
const send = (type, id) => electron.evaluate(({ BrowserWindow }, [t, i]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home'))?.webContents.send('home:open', t, i), [type, id])
for (const size of ['small', 'medium', 'large']) {
  await page.evaluate((s) => window.api.vigil('settings:set', { interfaceSize: s }), size)
  await send('view', 'today'); await home.waitForTimeout(800)
  await home.locator('text=call the accountant').first().click(); await home.waitForTimeout(900)
  await home.screenshot({ path: `${process.env.SHOT ?? process.env.QA_DATA}/task-${size}.png` })
}
process.exit(0)
