// Focus mode over a scene, in dark and light: is the text calm to read?
import { open } from './harness.mjs'
const qa = await open()
const { electron, page } = qa
await page.evaluate(() => window.api.vigil('scenery').catch(() => null))
await page.waitForTimeout(25000) // first scan of the picture folders
await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home')); w?.setBounds({ width: 1200, height: 800 }); w?.show() })
const home = electron.windows().find((w) => w.url().includes('home'))
await home.waitForTimeout(800); await home.keyboard.press('Escape')
await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home'))?.webContents.send('home:open', 'view', 'inbox'))
await home.waitForTimeout(800)
await home.evaluate(() => { document.documentElement.dataset.focus = 'on' })
await home.waitForTimeout(2500)
await home.screenshot({ path: `${process.env.SHOT ?? process.env.QA_DATA}/focus-dark.png` })
await home.evaluate(() => { localStorage.setItem('theme', 'light'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) })
await home.waitForTimeout(2500)
await home.screenshot({ path: `${process.env.SHOT ?? process.env.QA_DATA}/focus-light.png` })
process.exit(0)
