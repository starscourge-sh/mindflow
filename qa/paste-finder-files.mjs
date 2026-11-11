// A paste asks nothing of the main process that makes the window wait, and files copied in Finder still come in.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/paste-finder-files.mjs
//
// Every paste used to ask main for the names of files copied in Finder with a call that waits for the answer
// (`clipboard:file-names`): while main was busy, a paste of plain words held the window. The paste itself already
// says which of its files lie on disk, so nothing is asked. Here real files are put on the clipboard the way Finder
// puts them (their place on disk, through Electron's own clipboard in the app under test) and pasted with ⌘V:
//   - a picture comes in as a picture, a text file as a card, two files as two;
//   - with the file's name on the clipboard beside it (as Finder writes it), the file comes in once and the name
//     is not pasted as words (the icon's picture is asked for too, but Electron's clipboard does not keep it);
//   - plain words pasted land as words;
//   - main was never asked `clipboard:file-names` or `clipboard:files` (they are gone);
// and the other call a page made as it loaded, `window:room`, is not made either: quick capture reads its room from
// its own environment, the same room main holds, also after its page is loaded again and after a hint moved it.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, electron, page: box } = c
const wait = (ms) => h.waitForTimeout(ms)
const FORMAT = (name) => `electron application/osclipboard;format="${name}"`
/** A 1 by 1 PNG: a picture on disk, and a file's icon on the clipboard. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

let was = ''
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const dir = join(process.env.QA_DATA, 'copied-in-finder')
  mkdirSync(dir, { recursive: true })
  const file = (name, bytes) => { writeFileSync(join(dir, name), bytes); return join(dir, name) }
  const picture = file('holiday.png', PNG)
  const words = file('reading-list.txt', 'Middlemarch\nThe Waves\n')
  const second = file('minutes.txt', 'Agreed: meet on Friday.\n')
  was = await electron.evaluate(({ clipboard }) => clipboard.readText())

  /** A fresh note with the caret in it, and what is in it after a paste. */
  const note = async (title) => {
    const id = await v('article:new')
    await v('item:save', id, { title, body: { type: 'doc', content: [{ type: 'paragraph' }] } })
    await c.send('article', id)
    const sel = `[data-open="${id}"] .tiptap`
    await h.waitForSelector(sel, { timeout: 20000 })
    await wait(700)
    await h.click(`${sel} p`)
    return sel
  }
  const inNote = (sel) => h.evaluate((sel) => {
    const ed = document.querySelector(sel)
    return {
      pictures: [...ed.querySelectorAll('img')].filter((one) => !one.closest('.tiptap-attachment, [data-type="emoji"]')).length,
      cards: [...ed.querySelectorAll('.tiptap-attachment .tiptap-attachment-name')].map((one) => one.textContent),
      words: [...ed.querySelectorAll('p')].map((one) => one.textContent).join(' ').trim()
    }
  }, sel)
  /** Put on the clipboard through Electron, in the app under test, then pasted with ⌘V and given time to be kept. */
  const paste = async (sel, write, arg, settle = 1500) => {
    await electron.evaluate(write, arg)
    await h.click(`${sel} p`)
    await h.keyboard.press('Meta+v')
    await wait(settle)
    return inNote(sel)
  }
  const oneFile = async ({ clipboard, ClipboardItem }, [format, url]) => clipboard.write([new ClipboardItem({ [format]: new Blob([url]) })])

  // A picture copied in Finder: a picture in the note.
  let sel = await note('A copied picture')
  let got = await paste(sel, oneFile, [FORMAT('public.file-url'), pathToFileURL(picture).href])
  check('a picture file copied in Finder pastes as a picture, not its name', got.pictures === 1 && !got.cards.length && !/holiday/.test(got.words), JSON.stringify(got))

  // A text file: a card with its name.
  sel = await note('A copied file')
  got = await paste(sel, oneFile, [FORMAT('public.file-url'), pathToFileURL(words).href])
  check('a text file copied in Finder pastes as its card', got.cards.join() === 'reading-list.txt' && !got.pictures, JSON.stringify(got))

  // As Finder writes it: where the file lies, with the file's icon and its name beside it.
  sel = await note('A copied file with its icon')
  got = await paste(sel, async ({ clipboard, ClipboardItem }, [format, url, png, name]) => clipboard.write([new ClipboardItem({ [format]: new Blob([url]), 'image/png': new Blob([Uint8Array.from(png)], { type: 'image/png' }), 'text/plain': new Blob([name], { type: 'text/plain' }) })]), [FORMAT('public.file-url'), pathToFileURL(words).href, [...PNG], 'reading-list.txt'])
  const seen = await electron.evaluate(async ({ clipboard }) => (await clipboard.read()).flatMap((item) => item.types).filter((type) => /^(text\/|image\/)/.test(type)))
  // Electron's clipboard keeps the name beside the file but not the icon's picture (it held text/plain and
  // text/uri-list here), so the icon is asked for and what was really held is printed: the name is what this proves.
  check('with its name on the clipboard beside it (and its icon, where the clipboard keeps one), the file comes in once: no name as words, no icon picture', got.cards.join() === 'reading-list.txt' && got.pictures === 0 && !/reading-list/.test(got.words) && seen.includes('text/plain'), `${JSON.stringify(got)}; the clipboard held ${JSON.stringify(seen)}`)

  // Two files copied together.
  sel = await note('Two copied files')
  const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><array><string>${words}</string><string>${second}</string></array></plist>`
  got = await paste(sel, oneFile, [FORMAT('NSFilenamesPboardType'), plist], 2000)
  check('two files copied together paste as two cards, in their order', got.cards.join() === 'reading-list.txt,minutes.txt', JSON.stringify(got))

  // Plain words.
  sel = await note('Copied words')
  got = await paste(sel, ({ clipboard }, text) => clipboard.writeText(text), 'Only a few words, copied.', 700)
  check('plain words pasted land as words', got.words === 'Only a few words, copied.' && !got.cards.length && !got.pictures, JSON.stringify(got))

  // What main was asked meanwhile: every handler is counted by name as it is called (main's stalls.ts).
  const rows = (await electron.evaluate(() => globalThis.mainStalls?.()))?.rows ?? []
  const asked = (name) => rows.find((one) => one.name === name)?.calls ?? 0
  check('five pastes, and main was never asked for copied file names with a call that waits (clipboard:file-names, clipboard:files)', rows.length > 0 && asked('clipboard:file-names') === 0 && asked('clipboard:files') === 0, `clipboard:file-names ${asked('clipboard:file-names')}, clipboard:files ${asked('clipboard:files')} of ${rows.length} handlers called`)
  const windows = electron.windows().length
  check('no window asked main for its room, its book or the clock as it loaded (window:room, book:here, clock:twelve)', asked('window:room') === 0 && asked('book:here') === 0 && asked('clock:twelve') === 0, `window:room ${asked('window:room')}, book:here ${asked('book:here')}, clock:twelve ${asked('clock:twelve')}, with ${windows} windows open`)

  // The room quick capture's page knows is the room main holds (asked here the old way, of main itself).
  const held = () => electron.evaluate(({ ipcMain, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((one) => /\/index\.html/.test(one.webContents.getURL()))
    const event = { sender: win?.webContents, returnValue: undefined }
    ipcMain.emit('window:room', event)
    return event.returnValue
  })
  const known = () => box.evaluate(() => ({ ...window.api.room }))
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const first = { page: await known(), main: await held() }
  check('quick capture knows its room without asking: the same room main holds, with its side, menu room and pill width', first.page.left > 0 && first.page.pill > 0 && same(first.page, first.main), `page ${JSON.stringify(first.page)}; main ${JSON.stringify(first.main)}`)
  check('a window that is all card has no room', same(await h.evaluate(() => ({ ...window.api.room })), { left: 0, top: 0, right: 0, bottom: 0 }), JSON.stringify(await h.evaluate(() => ({ ...window.api.room }))))
  await box.reload()
  await box.waitForLoadState('domcontentloaded')
  await wait(600)
  check('its page loaded again reads the same room', same(await known(), first.main), JSON.stringify(await known()))
  // A hint moved the room (main tells the page): the page loaded again after that reads the room as it is now.
  const moved = { top: first.main.top + 40, left: first.main.left, right: first.main.right, bottom: first.main.bottom + 24, side: 'below' }
  const tell = (room) => electron.evaluate(({ BrowserWindow }, room) => BrowserWindow.getAllWindows().find((one) => /\/index\.html/.test(one.webContents.getURL()))?.webContents.send('window:room-hint', room), room)
  await tell(moved)
  await wait(300)
  await box.reload()
  await box.waitForLoadState('domcontentloaded')
  await wait(600)
  const after = await known()
  check('after a hint moved the room, the page loaded again reads the room as it is now, not as it was at first', after.top === moved.top && after.bottom === moved.bottom && after.side === 'below' && after.pill === first.main.pill, JSON.stringify(after))
  // Put back as main holds it.
  await tell({ top: first.main.top, left: first.main.left, right: first.main.right, bottom: first.main.bottom, side: first.main.side })
  await wait(300)
  await box.reload()
  await box.waitForLoadState('domcontentloaded')
  await wait(400)
  check('and put back, it is main\'s room again', same(await known(), first.main), JSON.stringify(await known()))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await electron.evaluate(({ clipboard }, text) => clipboard.writeText(text), was).catch(() => {})
  await c.close()
  done()
}
