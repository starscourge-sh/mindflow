// “Stop” on long jobs: each is started on enough to take a while, stopped
// with its “Stop” (a click, or Esc on it), and checked that it says
// “Stopped” and left nothing half-written in the folder it was writing to.
// A run to the end first proves the job really writes there.
//
//   npx electron-vite build --outDir out-stop
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-stop/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/stop-jobs.mjs
import { mkdtempSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-stop-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
// A made-up Notes, slow to say its folders, so asking it can be stopped.
const notesFile = join(mkdtempSync(join(tmpdir(), 'haligtree-stop-notes-')), 'apple-notes.json')
writeFileSync(notesFile, JSON.stringify({ folders: [{ id: 'f1', name: 'Recipes', notes: [{ id: 'n1', title: 'Bread', html: '<div>Flour</div>', created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z' }] }] }))
process.env.HALIGTREE_QA_APPLE_NOTES = notesFile
process.env.HALIGTREE_QA_APPLE_NOTES_WAIT = '200'

const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const results = []
const check = (name, ok, said) => (results.push({ name, ok }), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${said})`))
const MANY = 4000

// Many files in the store, and one note pointing at every one, so both jobs take a while.
const hashes = await c.electron.evaluate(async ({ app }, many) => {
  const { mkdir, writeFile } = process.getBuiltinModule('fs/promises')
  const { createHash } = process.getBuiltinModule('crypto')
  const { join } = process.getBuiltinModule('path')
  const dir = join(app.getPath('userData'), 'assets')
  await mkdir(dir, { recursive: true })
  const made = []
  for (let i = 0; i < many; i++) {
    const bytes = Buffer.alloc(40000, i % 251)
    bytes.writeUInt32BE(i, 0)
    const name = `${createHash('sha256').update(bytes).digest('hex')}.png`
    await writeFile(join(dir, name), bytes)
    made.push(name)
  }
  return made
}, MANY)
const note = await h.evaluate(async (names) => {
  const id = await window.api.haligtree('article:new')
  const body = { type: 'doc', content: names.map((name, i) => ({ type: 'image', attrs: { src: `haligtree://assets/${name}`, alt: `picture ${i}` } })) }
  await window.api.haligtree('item:save', id, { title: 'Many pictures', body })
  return id
}, hashes)

/** The folder picker answers with a fresh folder; its path is handed back. */
const pickFolder = () => c.electron.evaluate(async ({ dialog }) => {
  const { mkdtemp } = process.getBuiltinModule('fs/promises')
  const { tmpdir } = process.getBuiltinModule('os')
  const { join } = process.getBuiltinModule('path')
  const folder = await mkdtemp(join(tmpdir(), 'haligtree-stop-to-'))
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
  return folder
})
const entries = (folder) => { try { return readdirSync(folder, { recursive: true }).length } catch { return -1 } }
const toastSays = () => h.evaluate(() => [...document.querySelectorAll('[data-sonner-toast], [role="status"], [data-toast]')].map((one) => one.textContent.trim()).join(' | '))
/** Stop the job: the chip's “Stop”, by click or by Esc while it has the keys. */
const stopIt = async (how) => {
  const stop = h.locator('[data-job-stop]').first()
  await stop.waitFor({ timeout: 10000 })
  await h.waitForTimeout(150)
  if (how === 'esc') { await stop.focus(); await h.keyboard.press('Escape') } else await stop.click()
}
const waitGone = () => h.waitForFunction(() => !document.querySelector('[data-job-stop]'), null, { timeout: 30000 })

for (const job of [
  { name: 'Export everything', run: () => h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:export-all'))), how: 'click' },
  // ⌘K's “Save all attachments”, as a person finds it.
  { name: 'Save all attachments', run: async () => { await h.keyboard.press('Meta+k'); await h.waitForTimeout(400); await h.keyboard.type('Save all attachments'); await h.waitForTimeout(500); await h.keyboard.press('Enter') }, how: 'esc' }
]) {
  try {
    // To the end first: the job writes into the folder.
    const whole = await pickFolder()
    await job.run(note)
    await h.waitForSelector('[data-job-stop]', { timeout: 10000 })
    await waitGone()
    await h.waitForTimeout(500)
    const wrote = entries(whole)
    // Then stopped part way.
    const folder = await pickFolder()
    await job.run(note)
    await stopIt(job.how)
    await waitGone()
    await h.waitForTimeout(600)
    const left = entries(folder)
    const said = await toastSays()
    check(`${job.name}: Stop (${job.how}) leaves nothing written and says so`, wrote > 100 && left === 0 && /Stopped/.test(said), `whole run wrote ${wrote}, stopped run left ${left}, toast "${said.slice(0, 60)}"`)
  } catch (error) {
    check(job.name, false, String(error.message ?? error).slice(0, 200))
  }
}

// Asking Notes for its folders: Stop, and it is back at the start, nothing read.
try {
  const before = await h.evaluate(() => window.api.haligtree('items', 'article').then((all) => all.length))
  await h.evaluate(() => void window.api.importFrom('apple-notes'))
  await h.waitForSelector('[data-import-folders="ask"]', { timeout: 8000 })
  await h.click('[data-notes-continue]')
  await stopIt('click')
  await h.waitForSelector('[data-import-folders="ask"]', { timeout: 8000 })
  await h.waitForTimeout(1500)
  const after = await h.evaluate(() => window.api.haligtree('items', 'article').then((all) => all.length))
  const said = await toastSays()
  check('Asking Notes for its folders: Stop goes back to the start, nothing read', after === before && /Stopped/.test(said) && !(await h.$('[data-import-folders="choose"]')), `notes ${before} → ${after}, toast "${said.slice(0, 60)}"`)
} catch (error) {
  check('Asking Notes for its folders', false, String(error.message ?? error).slice(0, 200))
}

await c.close()
const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed.`)
process.exit(failed.length ? 1 : 0)
