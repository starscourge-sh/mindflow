// Open every section of the main window and the box's panels, and report any error.
import { open } from './harness.mjs'
const qa = await open()
const { electron, page } = qa
const errors = []
const watch = (p, name) => {
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`))
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text().slice(0, 200)}`) })
}
watch(page, 'box')
await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
await page.waitForTimeout(2500)
const wins = electron.windows()
const home = wins.find((w) => w !== page)
if (!home) { console.log('no home window', wins.map((w) => w.url())); process.exit(1) }
watch(home, 'home')
await home.waitForTimeout(800)
for (const key of 'irptuwozna#sldv') {
  await home.keyboard.press('Escape')
  await home.keyboard.press('g'); await home.keyboard.press(key)
  await home.waitForTimeout(700)
  const text = await home.evaluate(() => document.body.innerText.slice(0, 80).replace(/\n/g, ' | '))
  const crashed = await home.evaluate(() => /Something went wrong|Unexpected Application Error/i.test(document.body.innerText))
  console.log(`g${key}`, crashed ? 'CRASHED' : 'ok', '·', text)
}
// Settings via the home's onSentTo isn't reachable from here; use ⌘,
await home.keyboard.press('Meta+,'); await home.waitForTimeout(800)
console.log('settings', (await home.evaluate(() => document.body.innerText.includes('Shortcuts'))) ? 'has Shortcuts' : 'NO Shortcuts')
await home.keyboard.press('Shift+?'); await home.waitForTimeout(500)
// Box: type math, a task, a timer
await qa.reset()
await qa.type(['2+2='])
await page.waitForTimeout(1500)
console.log('math ghost', await page.evaluate(() => document.querySelector('.tiptap')?.parentElement?.innerHTML.match(/calc[^"]*"[^>]*>[^<]*/)?.[0] ?? 'none'))
await page.screenshot({ path: process.env.SHOT + '/box.png' })
await home.screenshot({ path: process.env.SHOT + '/home.png' })
console.log('ERRORS', errors.length); for (const e of [...new Set(errors)].slice(0, 40)) console.log(' -', e)
await qa.close(); process.exit(0)
