// The rest of the folders plan (plan-folders-kinds-groups.md, 19 Nov): what a folder offers out of its own notes, and
// quick capture's ">name" (main/folder-gems.ts, folder-gems.tsx, marginalia.tsx `FolderMargin`, lib/box-tokens.ts):
// 1. A folder whose note holds someone's words and a highlighted line says once, quietly, "2 lines here could be gems
//    · See them", labelled with what read them; ↵ keeps one as a gem in the folder, ⌫ lets one go, ⌘Z takes it back;
//    once answered the line is not shown again.
// 2. "Write from this folder" makes a page in Writing (in no folder), with the folder's gems and highlights in its
//    margin, and "Insert" puts one in as a signed quote; the folder stays.
// 3. Quick capture's ">thes" is lit as "Keep in Thesis", and ⌘↵ keeps the note there, out of the Inbox, the mark taken
//    off its words; ">zzz" is greyed as matching no folder.
// The Mac's model is stood in (HALIGTREE_QA_CAPS=ai): it picks what the rules pick, so the lines are known.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-f7/main/index.js HALIGTREE_QA_AWAY=1 node qa/folder-gems.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_CAPS = 'ai'

const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1180, height: 800 })
const { h, page: box } = c
const wait = (ms) => h.waitForTimeout(ms)
const until = async (ask) => { for (let i = 0; i < 50; i++) { const got = await ask(); if (got) return got; await wait(100) } return ask() }
const said = () => h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent?.trim()).filter(Boolean).join(' | '))
const shot = async (name) => shots && c.both(`${shots}/${name}`)
try {
  await c.v('settings:set', { hintRate: 0, rotCount: 0, sounds: false })
  const folder = await c.v('folders:make', 'Thesis')
  // A note in it: someone's words, a highlighted line of the person's own, and plain lines that are no gem.
  const QUOTE = '“We are what we repeatedly do. Excellence, then, is not an act, but a habit.” - Will Durant'
  const MARKED = 'Memory is a reconstruction, not a recording of what happened'
  const doc = { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Notes for chapter two' }] },
    { type: 'paragraph', content: [{ type: 'text', text: QUOTE }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'I think ' }, { type: 'text', text: MARKED, marks: [{ type: 'highlight' }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Check the library hours before Friday.' }] }
  ] }
  const note = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body, elapsedMs: 0 }), doc)
  await c.v('folders:file', [{ type: 'capture', id: note }], folder)
  await wait(500)
  await h.locator(`[data-side-folder="${folder}"]`).click()
  await wait(1500)

  // 1. The quiet line, once.
  const line = h.locator('[data-folder-gems-line]')
  const words = await until(async () => (await line.count()) && (await line.textContent()))
  check('the folder says, quietly, how many lines could be gems', /2 lines here could be gems/.test(words ?? ''), words)
  check('it says what read them (the Mac\'s model, stood in)', /Apple Intelligence, on this Mac/.test(words ?? ''), words)
  await shot('gems-line')
  await h.locator('[data-folder-gems-see]').click()
  await wait(500)
  const rows = () => h.locator('[data-folder-gem-idea]').allTextContents()
  const listed = await rows()
  check('"See them" lists the two lines, each with its note', listed.length === 2 && listed.some((one) => /Excellence/.test(one)) && listed.some((one) => /reconstruction/.test(one)) && listed.every((one) => /from Notes for chapter two/.test(one)), JSON.stringify(listed))
  await shot('gems-list')
  const first = listed[0]
  await h.keyboard.press('Enter')
  const gem = await until(async () => (await c.v('items', 'nugget')).find((one) => first.includes(one.title.slice(0, 30))))
  check('↵ keeps the line the cursor is on as a gem', !!gem, await said())
  check('the gem is kept in the folder', !!gem && (await c.v('folders:of', 'nuggets'))[gem.id] === folder)
  check('and said so, with Undo', /Kept as a gem in Thesis/.test(await said()), await said())
  check('it leaves the list', await until(async () => (await rows()).length === 1), JSON.stringify(await rows()))
  await h.keyboard.press('Backspace')
  check('⌫ lets the other go', await until(async () => (await rows()).length === 0), JSON.stringify(await rows()))
  await h.keyboard.press('Meta+z')
  check('⌘Z offers it again', await until(async () => (await rows()).length === 1), JSON.stringify(await rows()))
  await h.keyboard.press('Backspace')
  await wait(500)
  // Away and back: answered, so the line is not said again.
  await c.go('articles')
  await h.locator(`[data-side-folder="${folder}"]`).click()
  await wait(1500)
  check('once answered, the folder\'s line is not shown again', (await line.count()) === 0)

  // 2. "Write from this folder".
  await h.locator('[data-folder-write-from]').click()
  await wait(1800)
  const pages = await c.v('items', 'article')
  const made = pages.find((one) => one.title === 'On Thesis')
  check('"Write from this folder" makes a page in Writing', !!made, JSON.stringify(pages.slice(0, 3).map((one) => one.title)))
  check('the page is in no folder, and the folder stays', !!made && !(await c.v('folders:of', 'nuggets'))[made.id] && (await c.v('folders')).some((one) => one.id === folder))
  const margin = h.locator(`[data-folder-margin="${folder}"]`)
  await until(async () => (await margin.count()) > 0)
  const side = (await margin.textContent()) ?? ''
  check('its margin holds the folder\'s gem and its highlight', /From Thesis/.test(side) && /Excellence/.test(side) && /reconstruction/.test(side), side.slice(0, 200))
  await shot('write-from')
  await margin.locator('[data-folder-quote]').first().hover()
  await margin.locator('[data-folder-quote-insert]').first().click()
  await wait(800)
  const written = await h.evaluate(() => document.querySelector('.ProseMirror blockquote')?.textContent ?? '')
  check('"Insert" puts it in the page as a signed quote', /Excellence/.test(written) && /Will Durant|Notes for chapter two/.test(written), written)

  // 3. Quick capture's ">name".
  await box.evaluate(() => window.api.showPrompt())
  await wait(1200)
  const EDITOR = '.tiptap.ProseMirror.haligtree-editor'
  await box.click(EDITOR)
  await box.keyboard.type('Chapter three >zzz', { delay: 15 })
  await wait(600)
  check('">zzz" that names no folder is greyed and says so', (await box.locator('[data-box-token="folder-miss"]').count()) === 1 && /No folder matches/.test((await box.locator('[data-will-do]').textContent()) ?? ''), (await box.locator('[data-will-do]').textContent()) ?? '')
  await box.keyboard.press('Meta+a')
  await box.keyboard.press('Backspace')
  await box.keyboard.type('Chapter two outline >thes', { delay: 15 })
  await wait(600)
  const will = (await box.locator('[data-will-do]').textContent()) ?? ''
  check('">thes" is lit as "Keep in Thesis", the one picker\'s match', (await box.locator('[data-box-token="folder"]').count()) === 1 && /Keep in Thesis/.test(will), will)
  if (shots) await box.screenshot({ path: `${shots}/box-folder.png` })
  await box.keyboard.press('Meta+Enter')
  const filed = await until(async () => {
    const of = await c.v('folders:of', 'captures')
    const ids = Object.keys(of).filter((id) => of[id] === folder && id !== note)
    return ids.length ? ids : null
  })
  check('⌘↵ keeps the note in Thesis', !!filed?.length, JSON.stringify(filed))
  // Said where it can be read: the box has gone, so in the main window, with its Undo.
  const notices = async () => [...await box.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent)).catch(() => []), ...await h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent))].join(' | ')
  check('a notice says it was kept in Thesis, with Undo, where it can be seen', /in Thesis/.test(await h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent).join(' | '))), await notices())
  const title = filed?.length ? await h.evaluate((id) => window.api.captures.get(id).then((one) => one?.title || one?.label || JSON.stringify(one?.body)), filed[0]) : ''
  check('the ">thes" is taken off its words', !!title && !/>thes/.test(title) && /Chapter two outline/.test(title), title)
} finally {
  await c.close()
}
done()
