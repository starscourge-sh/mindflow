// A hard quit (kill -9 of the main process) leaves nothing behind: no helper process still running, and every small
// state file in the data folder (stickies, the window's place, moments, spots) reads whole, none half-written.
// Those files are written whole under another name, then named (src/main/write-whole.ts).
// batch: own launch, it kills the app with kill -9 and reads what the crash left
//
//   npx electron-vite build --outDir out-w
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-w/main/index.js HALIGTREE_QA_AWAY=1 node qa/hard-quit.mjs
import { execSync } from 'child_process'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { checks, open } from './harness.mjs'

const { check, done } = checks()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const run = await open()
const app = run.electron
await wait(5000)
const pid = await app.evaluate(() => process.pid)
const data = await app.evaluate(({ app: a }) => a.getPath('userData'))
// The window moved and a sticky's list saved, so the small files are written while the app is killed.
await app.evaluate(({ BrowserWindow }) => { for (const w of BrowserWindow.getAllWindows()) w.setBounds({ ...w.getBounds(), x: w.getBounds().x + 3 }) })
const kids = execSync(`pgrep -P ${pid} || true`).toString().trim().split('\n').filter(Boolean)
check('the app has helper processes to check', kids.length > 0, kids.join(','))
process.kill(pid, 'SIGKILL')
await wait(3000)
const alive = kids.filter((k) => { try { process.kill(Number(k), 0); return true } catch { return false } })
check('after kill -9, no helper process is left running', alive.length === 0, alive.length ? execSync(`ps -o pid,command -p ${alive.join(',')}`).toString() : '')
const files = []
const walk = (dir, depth = 0) => { for (const name of readdirSync(dir)) { const p = join(dir, name); const s = statSync(p); if (s.isDirectory() && depth < 1 && !/Cache|GPU|blob|IndexedDB|Local Storage|Session|Crashpad/i.test(name)) walk(p, depth + 1); else if (s.isFile() && name.endsWith('.json')) files.push(p) } }
walk(data)
const broken = files.filter((f) => { try { JSON.parse(readFileSync(f, 'utf8')); return false } catch { return true } })
check('every small state file reads whole', broken.length === 0, broken.join(', ') || `${files.length} files`)
done()
