// Every seeded surface of the sandbox, in a theme and at a size, for looking at.
//   QA_DATA=<tmp> QA_ARGS=--sandbox QA_ENTRY=out-sandbox/main/index.js SHOTS=<dir> THEME=github W=1000 H=700 node qa/sandbox-shots.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const W = Number(process.env.W ?? 1000), H = Number(process.env.H ?? 700)
const theme = process.env.THEME ?? 'github'
const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: W, height: H })
const { h, v, go, send } = c
if (theme !== 'github') await c.theme(theme)
await c.size(W, H)
const tag = `${theme}-${W}`
const shot = async (name, page = h) => { await page.waitForTimeout(400); await page.screenshot({ path: `${dir}/${name}-${tag}.png` }) }
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
const want = (name) => !only.length || only.includes(name)

const rows = await h.evaluate(() => window.api.captures.list())
const id = (start) => rows.find((row) => (row.label ?? '').startsWith(start))?.id
const capture = async (name, start, after) => {
  if (!want(name)) return
  await send('capture', id(start)); await h.waitForTimeout(1300)
  if (after) await after()
  await shot(name)
}
const view = async (name, target, after) => { if (!want(name)) return; await go(target); if (after) await after(); await shot(name) }

await view('home', 'home')
await view('inbox', 'inbox')
await view('review', 'review')
await view('day', 'day')
await view('week', 'weekpage')
await view('month', 'monthpage')
await view('today', 'today')
await view('goals', 'goals')
await view('holding', 'questions')
await view('nuggets', 'nuggets')
await view('articles', 'articles')
await view('routines', 'routines')
await view('tags', 'tags', async () => { await send('tags', 'renaissance').catch(() => {}); })
if (want('tag-album')) {
  await h.evaluate(() => 0)
  await c.electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('view=home'))?.webContents.send('home:open', 'view', 'tags'))
  await h.waitForTimeout(600)
  await h.evaluate(() => [...document.querySelectorAll('button, a')].find((b) => /renaissance/.test(b.textContent ?? ''))?.click())
  await shot('tag-album')
}
const items = async (tier) => h.evaluate((t) => window.api.vigil('items', t), tier)
if (want('goal')) { const goal = (await items('goal')).find((one) => one.title.startsWith('Get to Mars')); await send('goal', goal.id); await h.waitForTimeout(1300); await shot('goal') }
if (want('question')) { const q = (await items('question')).find((one) => one.title.startsWith('Is the top')); await send('question', q.id); await h.waitForTimeout(1300); await shot('question') }
if (want('article')) { const a = (await items('article'))[0]; await send('article', a.id); await h.waitForTimeout(1300); await shot('article') }
await capture('start-here', 'Start here')
await capture('decision', 'Which AI')
await capture('calc', 'Kessel Run')
await capture('link', 'Pale Blue Dot')
await capture('leonardo', "Leonardo's")
await capture('endurance', 'Mission log')
await capture('prestige', 'Every great trick')
await capture('odyssey', 'Tell me, O muse')
await capture('bit', "There's no place")
if (want('settings')) { await go('settings'); await h.evaluate(() => { const input = document.querySelector('input[placeholder^="Search"]'); }); await shot('settings') }
// The windows of their own: a sticky, the beacon, and the box.
if (want('sticky') || want('beacon')) {
  for (const win of c.electron.windows()) {
    const url = win.url()
    if (url.includes('view=sticky') && url.includes('type=capture') && want('sticky')) await shot('sticky', win)
    if (url.includes('view=sticky') && url.includes('type=goal') && want('beacon')) await shot('beacon', win)
  }
}
if (want('box')) {
  await c.electron.evaluate(({ BrowserWindow }) => { const box = BrowserWindow.getAllWindows()[0]; box.show() })
  await shot('box', c.page)
}
console.log('ERRORS', JSON.stringify(c.errors.slice(0, 20)))
await c.close()
process.exit(0)
