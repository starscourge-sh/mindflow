// The capture box in the Brutal style, on a theme: the small box with words
// in it, then wide with the side panel open, and a quote with its who chip.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-brutal/main/index.js SHOTS=<dir> THEME=github node qa/brutal-box.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const theme = process.env.THEME ?? 'github'
const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/brutal-box`
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: 1000, height: 700 })
const p = c.page
await p.evaluate((t) => { localStorage.setItem('style', 'brutal'); localStorage.setItem('theme', t); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
const bounds = (w, h) => c.electron.evaluate(({ BrowserWindow }, [w, h]) => { const box = BrowserWindow.getAllWindows()[0]; box.setBounds({ x: 60, y: 60, width: w, height: h }); box.show() }, [w, h])
await bounds(720, 300)
await p.waitForTimeout(900)
await p.keyboard.type('Ring the plumber about the boiler tomorrow 9am', { delay: 5 })
await p.waitForTimeout(700)
await p.screenshot({ path: `${dir}/box-small-${theme}.png` })
await p.keyboard.press('Meta+a'); await p.keyboard.press('Backspace')
await p.keyboard.type('"Do or do not. There is no try." Yoda', { delay: 5 })
await bounds(1100, 640)
await p.waitForTimeout(500)
await p.mouse.move(500, 20)
await p.click('[aria-label="Show the side panel"]', { timeout: 4000 }).catch(() => p.keyboard.press('Meta+\\'))
await p.waitForTimeout(1200)
await p.screenshot({ path: `${dir}/box-wide-${theme}.png` })
await c.close()
process.exit(0)
