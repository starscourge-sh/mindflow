// The sandbox, end to end: your own data folder byte-for-byte unchanged by
// entering, using, resetting and leaving it; every seeded example there; a
// reset giving the same world twice; Back and Reset restarting the right way;
// a thought caught in the sandbox offered to your own notes.
//
//   npx electron-vite build --outDir out-sandbox && QA_ENTRY=out-sandbox/main/index.js node qa/sandbox.mjs
import { createHash } from 'crypto'
import { mkdtempSync, readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import { sandbox } from './sandbox-lib.mjs'

const root = mkdtempSync(join(tmpdir(), 'vigil-sandbox-real-'))
process.env.QA_DATA = root
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }

/** Every file of your own data folder, by path and hash: never the sandbox's folder or the carry-out file it is allowed to write. */
function fingerprint() {
  const out = {}
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const rel = relative(root, path)
      if (rel === 'sandbox' || rel === 'sandbox-carry-out.json') continue
      if (statSync(path).isDirectory()) walk(path)
      else out[rel] = createHash('sha256').update(readFileSync(path)).digest('hex')
    }
  }
  walk(root)
  return out
}

const launch = async (args, options) => {
  process.env.QA_ARGS = args
  return sandbox(options)
}

/** The seeded world, without ids or times of day: what has to be the same after every reset. */
const snapshot = (c) => c.h.evaluate(async () => {
  const v = (channel, ...args) => window.api.vigil(channel, ...args)
  const day = (iso) => Math.round((new Date(iso).setHours(12, 0, 0, 0) - new Date().setHours(12, 0, 0, 0)) / 86400000)
  const captures = (await window.api.captures.list()).map((one) => `${one.kind}|${one.status}|${one.label}|${day(one.capturedAt)}`).sort()
  const items = []
  for (const tier of ['nugget', 'article', 'question', 'goal']) {
    for (const item of await v('items', tier)) {
      const full = await v('item', item.id)
      items.push(`${tier}|${item.title}|${day(item.createdAt)}|${(full.glosses ?? []).map((one) => `${day(one.createdAt)}:${one.body}`).join('/')}`)
    }
  }
  const tasks = (await v('tasks')).map((one) => `${one.title}|${one.status}|${one.dueAt ? day(one.dueAt) : '-'}`).sort()
  return { captures, items: items.sort(), tasks, queue: (await v('review:queue')).length, tags: (await v('tags')).map((one) => `${one.tag}:${one.count}`).sort() }
})

// A restart starts the next run itself and ends this one once it is up: both caught here.
const stub = (c) => c.electron.evaluate(({ app }) => {
  globalThis.__relaunched = null
  const children = process.mainModule.require('child_process')
  children.spawn = (_command, args) => (globalThis.__relaunched = args ?? [], { unref() {}, on() {}, kill() {} })
  app.relaunch = (options) => void (globalThis.__relaunched = options?.args ?? [])
  app.quit = () => void (globalThis.__quit = true)
  app.exit = () => void (globalThis.__quit = true)
})
const relaunched = async (c) => {
  for (let i = 0; i < 30 && !(await c.electron.evaluate(() => globalThis.__relaunched)); i++) await c.h.waitForTimeout(100)
  return c.electron.evaluate(() => globalThis.__relaunched)
}
const click = (c, selector, text) => c.h.evaluate(([s, t]) => {
  const found = [...document.querySelectorAll(s)].find((one) => (one.textContent ?? '').trim().includes(t))
  found?.click()
  return !!found
}, [selector, text])

// --- 1. Your own Vigil, with a little in it ------------------------------------------------
{
  const c = await launch('', { seeded: false })
  await c.h.evaluate(async () => {
    await window.api.captures.create({ body: 'My real thought: renew the passport' })
    await window.api.vigil('task:add', 'Call the dentist tomorrow', undefined, false)
  })
  const state = await c.v('sandbox:state')
  check('your own Vigil is not the sandbox', !state.on)
  check('no pill outside the sandbox', !(await c.h.$('[data-sandbox-pill]')))
  // Into the sandbox, the way every entry point goes: your look written down for it, then the restart.
  await c.h.evaluate(() => localStorage.setItem('theme', 'paper'))
  await c.v('settings:set', { motion: false, inRecordings: { main: true, box: false, stickies: false, bubble: false }, sceneryFolders: ['/Users/somebody/Pictures/Game art'], coversFolder: '/Users/somebody/Pictures/Covers', celebrationsFolder: '/Users/somebody/Pictures/GIFs' })
  await stub(c)
  await c.h.evaluate(() => window.dispatchEvent(new CustomEvent('vigil:sandbox-enter')))
  const enterArgs = await relaunched(c)
  check('Open the sandbox restarts with --sandbox', enterArgs?.includes('--sandbox') && !enterArgs.includes('--sandbox-reset'), JSON.stringify(enterArgs))
  const carry = JSON.parse(readFileSync(join(root, 'sandbox', 'carry.json'), 'utf8'))
  check('your look is carried in', carry.local.theme === 'paper' && carry.settings.inRecordings?.main === true && carry.settings.motion === false, JSON.stringify(carry.local))
  await c.h.waitForTimeout(800)
  await c.close()
}
await new Promise((done) => setTimeout(done, 1500))
const before = fingerprint()
check('your data folder has a database', !!before['mindflow.db'], `${Object.keys(before).length} files`)

// --- 2. The sandbox, set out ---------------------------------------------------------------
let first
{
  const started = Date.now()
  const c = await launch('--sandbox')
  const state = await c.v('sandbox:state')
  check('the sandbox seeds itself', state.on && state.seeded, `${Date.now() - started}ms`)
  check('its database is its own', existsSync(join(root, 'sandbox', 'mindflow.db')))
  check('it wears the look you carried in', (await c.h.evaluate(() => localStorage.getItem('theme'))) === 'paper' && (await c.v('settings')).motion === false)
  const pictures = await c.v('settings')
  check('its own landscapes and no covers folder, but your celebrations come along', pictures.sceneryFolders.length === 1 && pictures.sceneryFolders[0].includes('Sandbox scenery') && pictures.coversFolder === '' && pictures.celebrationsFolder === '/Users/somebody/Pictures/GIFs', JSON.stringify([pictures.sceneryFolders, pictures.coversFolder, pictures.celebrationsFolder]))
  const open = (await c.h.evaluate(() => window.api.captures.list())).filter((one) => one.status === 'open')
  check('Inbox holds 23 or more', open.length >= 23, `${open.length}`)
  check('Review has 2 or more due', (await c.v('review:queue')).length >= 2)
  const tasks = await c.v('tasks')
  const today = new Date().toDateString()
  check('a task due today', tasks.some((one) => one.title.startsWith('Return the briefcase') && new Date(one.dueAt).toDateString() === today))
  check('a task overdue', tasks.some((one) => one.title.startsWith('Return the Gilgamesh') && new Date(one.dueAt) < new Date()))
  const goals = await c.v('items', 'goal')
  const mars = goals.find((one) => one.title.startsWith('Get to Mars'))
  const marsFull = await c.v('item', mars.id)
  const logDays = new Set(marsFull.glosses.map((one) => new Date(one.createdAt).toDateString()))
  const left = Math.round((new Date(`${mars.goalAt}T12:00`) - new Date().setHours(12, 0, 0, 0)) / 86400000)
  check('Mars: 68 days left, 6 logs on 6 days', left === 68 && marsFull.glosses.length === 6 && logDays.size === 6, `${left} days, ${marsFull.glosses.length} logs, ${logDays.size} days`)
  const top = (await c.v('items', 'question')).find((one) => one.title.startsWith('Is the top'))
  check('the question holds 3 clues', (await c.v('item', top.id)).glosses.length === 3)
  const album = await c.v('tag:read', 'renaissance')
  // The four picture notes, and the Renaissance thread around them (qa/sandbox-renaissance.mjs).
  const pictured = album.filter((one) => JSON.stringify(one.body).includes('mindflow://assets/'))
  check('#renaissance has its pictures and the thread', pictured.length >= 4 && album.length >= 8, `${pictured.length} with pictures, ${album.length} in all`)
  const urls = c.electron.windows().map((one) => one.url())
  const stackWin = c.electron.windows().find((one) => one.url().includes('type=goal&id=stack'))
  const stacked = stackWin ? await stackWin.evaluate(() => window.api.beaconStack()) : []
  const dune = goals.find((one) => one.title.startsWith('Finish Dune'))
  check('a sticky and the goal stack are up: Dune, Mars, the Odyssey', urls.some((one) => one.includes('view=sticky') && one.includes('type=capture')) && stacked.length === 3 && stacked[0] === dune.id && stacked[1] === mars.id, JSON.stringify(stacked))
  check("today's tasks are a sticky too", urls.some((one) => one.includes('view=sticky') && one.includes('type=today')))
  check('every sandbox window is told so', urls.filter((one) => one.includes('index.html')).every((one) => one.includes('sandbox=1')))
  const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const key = `week:${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  check("this week's page is written", (await c.v('period', key)).exists)
  check('backups stay off iCloud', !(await c.v('backups:where')).includes('CloudDocs'), await c.v('backups:where'))
  for (const view of ['home', 'inbox', 'review', 'goals', 'settings']) {
    await c.go(view)
    check(`the pill shows on ${view}`, await c.h.$eval('[data-sandbox-pill]', (one) => one.getBoundingClientRect().width > 100).catch(() => false))
  }
  check('the window says Vigil sandbox', (await c.h.title()) === 'Vigil sandbox')
  // Memories come in kinds, picked at random: with a year of books behind it, "From Jane Austen" is one
  // too. Each one shown steps aside for a while, so asking again soon reaches the year-ago one.
  const memories = []
  for (let i = 0; i < 12 && !memories.includes('A year ago today'); i++) memories.push((await c.v('memory'))?.memory)
  check('a year ago today comes back', memories.includes('A year ago today'), memories.join(' | '))
  first = await snapshot(c)
  // Something of your own, caught while practising.
  await c.h.evaluate(() => window.api.captures.create({ body: 'Caught in the sandbox: book the train' }))
  await c.h.waitForTimeout(300)
  // Reset, through the pill: asked once, then the restart.
  await stub(c)
  await click(c, '[data-sandbox-pill] button', 'Reset')
  await c.h.waitForTimeout(400)
  const asked = await c.h.$eval('[data-sandbox-pill]', (one) => one.textContent)
  check('Reset asks first', asked.includes('Hold to start over'), asked)
  // Start over is held, not clicked: down for longer than the hold, then up.
  const sure = await c.h.evaluateHandle(() => [...document.querySelectorAll('[data-sandbox-pill] button')].find((one) => (one.textContent ?? '').includes('Hold to start over')))
  const box = await sure.asElement()?.boundingBox()
  await c.h.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await c.h.mouse.down()
  await c.h.waitForTimeout(1500)
  await c.h.mouse.up()
  // The blade lights across first (GOING_MS), then the restart.
  await c.h.waitForTimeout(2200)
  const resetArgs = await relaunched(c)
  check('Reset restarts with --sandbox --sandbox-reset', resetArgs?.includes('--sandbox') && resetArgs?.includes('--sandbox-reset'), JSON.stringify(resetArgs))
  // Back to my notes, through the pill.
  await c.h.reload()
  await c.h.waitForTimeout(1500)
  await stub(c)
  await click(c, '[data-sandbox-pill] button', 'notes')
  const backArgs = await relaunched(c)
  check('Back restarts without --sandbox', backArgs && !backArgs.some((one) => one.startsWith('--sandbox')), JSON.stringify(backArgs))
  const out = existsSync(join(root, 'sandbox-carry-out.json')) ? JSON.parse(readFileSync(join(root, 'sandbox-carry-out.json'), 'utf8')) : []
  check('the thought caught there is written down for your notes', out.length === 1 && JSON.stringify(out[0].body).includes('book the train'), `${out.length}`)
  check('no page errors', !c.errors.some((one) => one.startsWith('PAGEERROR')), c.errors.filter((one) => one.startsWith('PAGEERROR')).join(' | '))
  await c.close()
}

// --- 3. Reset for real, twice: the same world each time --------------------------------
for (const round of [1, 2]) {
  await new Promise((done) => setTimeout(done, 1500))
  const c = await launch('--sandbox --sandbox-reset')
  const again = await snapshot(c)
  const same = JSON.stringify(again) === JSON.stringify(first)
  if (!same) for (const key of Object.keys(first)) if (JSON.stringify(first[key]) !== JSON.stringify(again[key])) console.log('  differs:', key, JSON.stringify(first[key]).slice(0, 400), '\n  now:', JSON.stringify(again[key]).slice(0, 400))
  check(`reset ${round} gives the same world`, same)
  check(`reset ${round} took away what was caught`, !(await c.h.evaluate(() => window.api.captures.list())).some((one) => (one.label ?? '').includes('book the train')))
  await c.close()
}

// --- 4. The proof: your own folder, byte for byte ------------------------------------------
await new Promise((done) => setTimeout(done, 1000))
const after = fingerprint()
const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((path) => before[path] !== after[path])
check('your own data folder is byte-for-byte unchanged', changed.length === 0, changed.length ? changed.join(', ') : `${Object.keys(after).length} files, mindflow.db ${after['mindflow.db'].slice(0, 12)}`)

// --- 5. Back home: the offer -------------------------------------------------------------
{
  const c = await launch('', { seeded: false })
  const carried = await c.v('sandbox:carried')
  check('your Vigil offers what was caught in the sandbox', carried.length === 1, JSON.stringify(carried))
  await c.close()
}

const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed. Real data folder: ${root}`)
process.exit(failed.length ? 1 : 0)
