/**
 * The first launch after the rename brings in the notes from the old data
 * folder (src/main/old-data.ts). An old folder is made in a temp folder by an
 * old build itself (the Vigil era, 4e502f6a, built apart: QA_OLD_ENTRY) with
 * notes and a picture; the new build is pointed at it by HALIGTREE_OLD_DATA,
 * into an empty QA_DATA (as if it was opened once already), and must show
 * the notes and the picture, say so once, and leave the old folder as it was.
 *
 *   git archive 4e502f6a | tar -x -C <dir> && (cd <dir> && npx electron-vite build --outDir out)
 *   npx electron-vite build --outDir out-old
 *   QA_DATA=$(mktemp -d) QA_OLD_ENTRY=<dir>/out/main/index.js QA_ENTRY=out-old/main/index.js HALIGTREE_QA_AWAY=1 node qa/old-data.mjs
 */
import { createHash } from 'crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'
import { _electron } from 'playwright'
import { checks, open } from './harness.mjs'

const { check, done } = checks()
const oldEntry = process.env.QA_OLD_ENTRY
if (!oldEntry || !existsSync(oldEntry)) throw new Error('QA_OLD_ENTRY: an old build of the app (see the top of this file)')
const OLD = mkdtempSync(join(tmpdir(), 'haligtree-old-era-'))

const quit = async (app) => {
  const child = app.process()
  await app.evaluate(({ app }) => app.quit()).catch(() => undefined)
  for (let i = 0; i < 100 && child.exitCode === null && child.signalCode === null; i++) await new Promise((r) => setTimeout(r, 100))
  try { child.kill('SIGKILL') } catch {}
}

// 1. The old app makes its own folder: its schema, three notes, one with a picture.
const picture = readFileSync('resources/icon.png')
const name = `${createHash('sha256').update(picture).digest('hex')}.png`
mkdirSync(join(OLD, 'assets'), { recursive: true })
writeFileSync(join(OLD, 'assets', name), picture)
{
  const app = await _electron.launch({ args: [oldEntry], env: { ...process.env, MINDFLOW_USER_DATA: OLD, MINDFLOW_QA_AWAY: '1', HALIGTREE_USER_DATA: undefined } })
  const child = app.process()
  process.on('exit', () => { try { child.kill('SIGKILL') } catch {} })
  await app.firstWindow({ timeout: 60000 })
  let page
  for (let i = 0; !page && i < 300; i++) (page = app.windows().find((one) => !/[?&]view=/.test(one.url()) && /\.html/.test(one.url()))) || (await new Promise((r) => setTimeout(r, 100)))
  await page.waitForFunction(() => !!window.api?.captures, null, { timeout: 30000 })
  await page.evaluate(async (src) => {
    const doc = (text, extra = []) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...extra] })
    await window.api.captures.create({ kind: 'note', body: doc('Old era note one') })
    await window.api.captures.create({ kind: 'note', body: doc('Old era note two') })
    await window.api.captures.create({ kind: 'note', body: doc('Old era picture', [{ type: 'image', attrs: { src } }]) })
  }, `mindflow://assets/${name}`)
  const made = await page.evaluate(async () => (await window.api.captures.list()).length)
  check('the old build made its notes', made >= 3, made)
  await quit(app)
}
check('the old folder has an old-era database', existsSync(join(OLD, 'mindflow.db')) && !existsSync(join(OLD, 'haligtree.db')))

const hashFolder = (root) => {
  const hash = createHash('sha256')
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name)
      hash.update(relative(root, path))
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) hash.update(readFileSync(path)).update(String(statSync(path).mtimeMs))
    }
  }
  walk(root)
  return hash.digest('hex')
}
const before = hashFolder(OLD)

const listNotes = (page) => page.evaluate(async () => (await window.api.captures.list()).map((one) => one.label ?? one.title ?? ''))
const homeOf = async (electron) => {
  for (let i = 0; i < 300; i++) {
    const home = electron.windows().find((one) => /[?&]view=home/.test(one.url()))
    if (home) return home
    await new Promise((r) => setTimeout(r, 100))
  }
  return null
}
// 2. The new build opened once before the old folder is found (a friend who tried it first): it starts empty.
{
  const qa = await open()
  const labels = await listNotes(qa.page)
  check('the new build opened alone starts empty', labels.length === 0, labels.length)
  await quit(qa.electron)
}
check('so it made a folder of its own', existsSync(join(process.env.QA_DATA, 'haligtree.db')))

// 3. Opened again with the old folder there: the notes come in.
process.env.HALIGTREE_OLD_DATA = OLD
{
  const qa = await open()
  const labels = await listNotes(qa.page)
  check('every old note is there', ['Old era note one', 'Old era note two', 'Old era picture'].every((one) => labels.some((label) => String(label).includes(one))), JSON.stringify(labels))
  const home = await homeOf(qa.electron)
  const said = await home?.waitForFunction(() => document.body.innerText.includes('Your notes from Vigil are here'), null, { timeout: 20000 }).then(() => true).catch(() => false)
  check('said once, in the main window', said)
  const text = await home?.evaluate(() => document.body.innerText.match(/Your notes from Vigil[^\n]*/)?.[0] ?? '')
  check('names where the old copy is kept, no em dash', text.includes(OLD.split('/').pop()) && !text.includes('\u2014'), text)
  const body = await qa.page.evaluate(async () => {
    const list = await window.api.captures.list()
    const one = list.find((row) => String(row.label ?? '').includes('Old era picture'))
    return JSON.stringify((await window.api.captures.get(one.id))?.body ?? null)
  })
  check('the picture is linked by the new name', body.includes(`haligtree://assets/${name}`) && !body.includes('mindflow://'), body.slice(0, 200))
  const loaded = await home.evaluate((src) => new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth)
    img.onerror = () => resolve(0)
    img.src = src
  }), `haligtree://assets/${name}`)
  check('the picture loads', loaded > 0, loaded)
  const data = process.env.QA_DATA
  check('its databases by the new name', existsSync(join(data, 'haligtree.db')) && !existsSync(join(data, 'mindflow.db')))
  await quit(qa.electron)
}
check('the old folder is byte for byte as it was', hashFolder(OLD) === before)

// 4. A second launch brings nothing in again and says nothing.
{
  const marker = JSON.parse(readFileSync(join(process.env.QA_DATA, 'moved-in.json'), 'utf8'))
  check('the move is marked told', marker.told === true)
  const qa = await open()
  const labels = await listNotes(qa.page)
  check('the same notes the second time', labels.filter((one) => String(one).startsWith('Old era')).length === 3, labels.length)
  const home = await homeOf(qa.electron)
  await new Promise((r) => setTimeout(r, 3000))
  const again = await home?.evaluate(() => document.body.innerText.includes('Your notes from Vigil are here'))
  check('nothing said the second time', !again)
  await quit(qa.electron)
}
rmSync(OLD, { recursive: true, force: true })
done()
