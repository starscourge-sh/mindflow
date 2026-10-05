// Show the main window and photograph each new view, reporting any error.
import { open } from './harness.mjs'
const qa = await open()
const { electron, page } = qa
const errors = []
await page.waitForTimeout(2500)
await electron.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home')); w?.setBounds({ width: 1100, height: 760 }); w?.show() })
await page.waitForTimeout(800)
const home = electron.windows().find((w) => w.url().includes('home'))
home.on('pageerror', (e) => errors.push(e.message))
home.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
const send = (type, id) => electron.evaluate(({ BrowserWindow }, [type, id]) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('home'))?.webContents.send('home:open', type, id), [type, id])
for (const id of (process.env.VIEWS ?? 'inbox,week,later,day,archived,nuggets,stats,settings,tags').split(',')) {
  await send('view', id); await home.waitForTimeout(1200)
  await home.screenshot({ path: `${process.env.SHOT}/v-${id}.png` })
  console.log(id, (await home.evaluate(() => document.body.innerText.length)))
}
console.log('ERRORS', [...new Set(errors)].slice(0, 30).join('\n - '))
process.exit(0)
