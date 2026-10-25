// Bringing notes in from iCloud Drive ends on a card that says what came in,
// how many, where they went, and opens it: files picked from a made-up iCloud
// Drive folder, and that folder brought in whole. The real iCloud Drive is
// never touched. (Apple Notes is qa/note-imports.mjs; a restore from the
// daily iCloud backup is qa/save-backup-import.mjs.)
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/icloud-imports.mjs
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
// A stand-in for ~/Library/Mobile Documents/com~apple~CloudDocs, with a folder of notes in it.
const drive = mkdtempSync(join(tmpdir(), 'haligtree-icloud-'))
const folder = join(drive, 'com~apple~CloudDocs', 'Reading notes')
mkdirSync(join(folder, 'Books'), { recursive: true })
for (let i = 1; i <= 12; i++) writeFileSync(join(folder, 'Books', `Book ${i}.md`), `# Book ${i}\n\nWhat stayed with me from book ${i}.\n`)
writeFileSync(join(folder, 'Ideas.md'), '# Ideas\n\nOne a line.\n')
const c = await sandbox({ width: 1100, height: 760 })
const { h, electron, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const waitFor = async (test, ms = 15000) => { for (let t = 0; t < ms; t += 100) { if (await test()) return true; await wait(100) } return false }
const card = () => h.evaluate(() => document.querySelector('[data-import-done]')?.textContent ?? '')
const picked = (paths) => electron.evaluate(({ dialog }, paths) => {
  globalThis.__boxes = 0
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths })
  dialog.showMessageBox = async () => (globalThis.__boxes++, { response: 0 })
}, paths)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // --- Files picked from iCloud Drive -----------------------------------------------------
  await picked([join(folder, 'Ideas.md'), join(folder, 'Books', 'Book 1.md'), join(folder, 'Books', 'Book 2.md')])
  await h.evaluate(() => void window.api.importFrom('files', null))
  check('files: ends on a card in the app', await waitFor(async () => !!(await card())))
  let said = await card()
  check('files: says how many and from what', /3 files/.test(said) && /\b3\b.*(notes?|in)/.test(said), said.slice(0, 160))
  check('files: says where they went', /Inbox|Writing/.test(said), said.slice(0, 200))
  check('files: names each file', ['Ideas.md', 'Book 1.md', 'Book 2.md'].every((name) => said.includes(name)))
  const open = h.locator('[data-import-done] button', { hasText: /^Open/ }).first()
  check('files: a button opens where they went', await open.count() === 1, await open.textContent().catch(() => ''))
  await open.click(); await wait(900)
  check('files: it opens that page', await waitFor(() => h.evaluate(() => !document.querySelector('[data-import-done]') && /inbox|articles/.test(document.querySelector('[data-page]')?.getAttribute('data-page') ?? ''))), await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page')))
  // --- The iCloud Drive folder, whole -----------------------------------------------------
  await picked([folder])
  await h.evaluate(() => void window.api.importFrom('vault', null))
  // A folder of folders asks which to bring: all of them.
  const asked = await waitFor(async () => !!(await card()) || await h.evaluate(() => !!document.querySelector('[data-import-folders]')), 15000)
  if (await h.evaluate(() => !!document.querySelector('[data-import-folders]'))) {
    await h.locator('[data-import-folders] button', { hasText: /^(Import|Bring)/ }).last().click()
  }
  check('folder: ends on a card in the app', asked && await waitFor(async () => /notes? (is|are) in/.test(await card())))
  said = await card()
  check('folder: counts all 13 notes', /13 notes are in/.test(said), said.slice(0, 200))
  check('folder: says where they went and from where', /Reading notes/.test(said) && /Writing|Inbox/.test(said), said.slice(0, 220))
  check('folder: a button opens them', await h.locator('[data-import-done] button', { hasText: /^Open/ }).count() >= 1)
  check('no system "Imported" box', (await electron.evaluate(() => globalThis.__boxes)) === 0)
  await h.screenshot({ path: join(process.env.SHOTS ?? tmpdir(), 'icloud-folder-done.png') })
} finally {
  await c.close()
  rmSync(drive, { recursive: true, force: true })
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
