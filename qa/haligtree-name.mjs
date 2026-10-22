// The app is called Haligtree everywhere a person reads its name (53): the app
// and its menu, the main window, the menu bar's menu, Settings and What
// Haligtree can do; no "Haligtree" left on those pages. Notes stay where they were: a data
// folder copied to another place opens with its notes in it, and the folder
// is the one asked for, never one named after the new name.
//   npx electron-vite build --outDir out-x
//   QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/haligtree-name.mjs   (no sandbox: it makes its own folders)
import { cpSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const first = mkdtempSync(join(tmpdir(), 'haligtree-name-a-'))
const copy = mkdtempSync(join(tmpdir(), 'haligtree-name-b-'))
const sand = mkdtempSync(join(tmpdir(), 'haligtree-name-s-'))
delete process.env.QA_ARGS
const WORDS = 'A note written before the move, kept by its folder'
const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: WORDS }] }] }

try {
  // A first run writes a note into its folder.
  process.env.QA_DATA = first
  let c = await sandbox({ seeded: false })
  await c.h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc)
  await c.h.waitForTimeout(800)
  await c.close()

  // The folder copied elsewhere, as a move would leave it, and opened there.
  rmSync(copy, { recursive: true, force: true })
  cpSync(first, copy, { recursive: true })
  process.env.QA_DATA = copy
  c = await sandbox({ seeded: false, width: 1300, height: 900 })
  const { electron, h } = c
  const main = await electron.evaluate(({ app, Menu }) => ({ name: app.getName(), data: app.getPath('userData'), menu: Menu.getApplicationMenu()?.items[0]?.label ?? '' }))
  check('the app is called Haligtree', main.name === 'Haligtree', main.name)
  check('the app menu is Haligtree', main.menu === 'Haligtree', main.menu)
  check('its folder is the one it was given, not one named Haligtree', main.data === copy, main.data)
  const notes = await h.evaluate(() => window.api.captures.list?.() ?? [])
  const found = JSON.stringify(notes).includes(WORDS) || (await h.evaluate((w) => window.api.haligtree('search', w).then((r) => JSON.stringify(r)).catch(() => ''), WORDS)).includes(WORDS)
  check('the copied folder opens with its note', found)
  check('the main window says Haligtree', (await h.title()) === 'Haligtree', await h.title())
  let tray = []
  for (let i = 0; i < 40 && !tray.length; i++) (tray = await electron.evaluate(() => globalThis.trayMenu ?? [])), await h.waitForTimeout(250)
  const labels = tray.map((one) => one.label)
  check('the menu bar menu shows and quits Haligtree', labels.includes('Show Haligtree') && labels.includes('Quit Haligtree'), labels.filter(Boolean).slice(-4).join(' | '))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()

  // The pages, in the sandbox (past the welcome, full of notes).
  process.env.QA_DATA = sand
  process.env.QA_ARGS = '--sandbox'
  c = await sandbox({ width: 1300, height: 900 })
  check('the sandbox window says Haligtree sandbox', (await c.h.title()) === 'Haligtree sandbox', await c.h.title())
  const side = await c.h.evaluate(() => document.querySelector('aside')?.innerText ?? '')
  check('the sidebar has “What Haligtree can do”', side.includes('What Haligtree can do'), side.slice(-120))
  for (const page of ['settings', 'powers', 'home', 'inbox', 'today']) {
    await c.go(page)
    if (process.env.SHOT) await c.h.screenshot({ path: `${process.env.SHOT}/${page}.png` })
    const text = await c.h.evaluate(() => document.body.innerText)
    if (page === 'powers') check('its page is “What Haligtree can do”', (await c.h.evaluate(() => document.querySelector('h1')?.textContent ?? '')) === 'What Haligtree can do')
    check(`${page}: no “Vigil” on the page`, !/\bVigil\b/.test(text), text.match(/.{0,40}\bVigil\b.{0,40}/)?.[0])
  }
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
  await c.close()
} catch (error) {
  check('ran to the end', false, String(error).slice(0, 300))
} finally {
  rmSync(first, { recursive: true, force: true })
  rmSync(copy, { recursive: true, force: true })
  rmSync(sand, { recursive: true, force: true })
}
done()
