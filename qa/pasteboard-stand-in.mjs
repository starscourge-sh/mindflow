// A test run's clipboard is the app's stand-in, never the Mac's (src/main/pasteboard.ts, src/preload/stand-in-clipboard.ts):
// every helper the probes copy and paste with (qa/pasteboard.mjs), run once against the app, and every way the app
// copies landing on the stand-in: a page's navigator.clipboard, main's own copies, ⌘C and ⌘X in a note, on words picked
// on a page and in a field. Pastes carry words, HTML, a picture, files on disk, and what was copied.
//   QA_ARGS=--sandbox QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/pasteboard-stand-in.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { clearBoard, copiedKinds, copiedText, copiedTypes, paste, pasteCopied, putOnBoard } from './pasteboard.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h, v, electron } = c
const wait = (ms) => h.waitForTimeout(ms)
/** A 1 by 1 PNG. */
const PNG = [...Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')]
const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** A fresh note, open, the caret at its end. */
const note = async (title, ...lines) => {
  const id = await v('article:new')
  await v('item:save', id, { title, body: { type: 'doc', content: lines.length ? lines.map(p) : [{ type: 'paragraph' }] } })
  await c.send('article', id)
  const sel = `[data-open="${id}"] .tiptap:not(.is-line):not(.is-plain)`
  await h.waitForSelector(sel, { timeout: 20000 })
  await wait(700)
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel)
  return sel
}
const inNote = (sel) =>
  h.evaluate((sel) => {
    const ed = document.querySelector(sel)
    return { text: ed.innerText, pictures: ed.querySelectorAll('img').length, cards: [...ed.querySelectorAll('.tiptap-attachment-name')].map((one) => one.textContent), links: [...ed.querySelectorAll('a[href]')].map((one) => one.getAttribute('href')) }
  }, sel)
/** Picks the words in the note, as a drag over them would. */
const pick = (sel, words) =>
  h.evaluate(([sel, words]) => {
    const e = document.querySelector(sel).editor
    let at = -1
    e.state.doc.descendants((node, pos) => void (at < 0 && node.isText && node.text.includes(words) && (at = pos + node.text.indexOf(words))))
    e.chain().focus().setTextSelection({ from: at, to: at + words.length }).run()
  }, [sel, words])

try {
  await v('settings:set', { sounds: false, hintRate: 0 })

  // 1. The stand-in itself: put on, read back each way, emptied.
  await putOnBoard(electron, 'words from another app')
  check('putOnBoard puts words on the stand-in, and copiedText reads them', (await copiedText(electron)) === 'words from another app', await copiedText(electron))
  await putOnBoard(electron, { 'text/plain': 'with a picture', 'image/png': { bytes: PNG } })
  const kinds = await copiedKinds(electron)
  check('copiedKinds reads each kind: words as words, a picture as its bytes', kinds['text/plain'] === 'with a picture' && kinds['image/png']?.bytes?.length === PNG.length, JSON.stringify(Object.keys(kinds)))
  check('copiedTypes lists the kinds', (await copiedTypes(electron)).join() === 'text/plain,image/png', (await copiedTypes(electron)).join())
  await clearBoard(electron)
  check('clearBoard empties it', (await copiedText(electron)) === '' && !(await copiedTypes(electron)).length)

  // 2. A page's navigator.clipboard is the same stand-in, both ways.
  await h.evaluate(() => navigator.clipboard.writeText('written by the page'))
  check("a page's navigator.clipboard.writeText lands on the stand-in", (await copiedText(electron)) === 'written by the page', await copiedText(electron))
  await putOnBoard(electron, { 'text/plain': 'read by the page', 'image/png': { bytes: PNG } })
  const read = await h.evaluate(async () => ({ text: await navigator.clipboard.readText(), types: (await navigator.clipboard.read()).flatMap((item) => item.types) }))
  check('and readText and read give the page what is on it', read.text === 'read by the page' && read.types.join() === 'text/plain,image/png', JSON.stringify(read))
  await h.evaluate((png) => navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([Uint8Array.from(png)], { type: 'image/png' }) })]), PNG)
  check('navigator.clipboard.write of a picture lands as a picture', (await copiedTypes(electron)).join() === 'image/png', (await copiedTypes(electron)).join())

  // 3. Main's own copies (a picture copied, "Copy as image") land there too.
  await clearBoard(electron)
  const took = await h.evaluate((png) => window.api.copyPicture(Uint8Array.from(png)), PNG)
  check("main's own copy of a picture lands on the stand-in", took === true && (await copiedTypes(electron)).join() === 'image/png', `${took} ${(await copiedTypes(electron)).join()}`)

  // 4. ⌘C and ⌘X in a note: what the editor copies, words and HTML; ⌘X takes them out of the note.
  let sel = await note('Copied from', 'Alpha beta gamma.')
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.selectAll(), sel)
  await h.keyboard.press('Meta+c')
  await wait(300)
  let got = await copiedKinds(electron)
  check('⌘C in a note puts its words and its HTML on the stand-in', /Alpha beta gamma\./.test(got['text/plain'] ?? '') && /<p[^>]*>Alpha beta gamma\.<\/p>/.test(got['text/html'] ?? ''), JSON.stringify(got).slice(0, 200))
  await pick(sel, 'beta ')
  await h.keyboard.press('Meta+x')
  await wait(300)
  // The note's own plain copy trims the space at the end (plain-copy.ts).
  check('⌘X puts the picked words on the stand-in and takes them out of the note', (await copiedText(electron)) === 'beta' && (await inNote(sel)).text.includes('Alpha gamma.'), `${JSON.stringify(await copiedText(electron))} / ${(await inNote(sel)).text}`)

  // 5. ⌘C and ⌘X where nothing takes the copy: words picked on a page, and in a field.
  await h.evaluate(() => {
    const words = Object.assign(document.body.appendChild(document.createElement('p')), { id: 'qa-words', tabIndex: -1, textContent: 'Words on the page itself.' })
    // Selectable, as a note's or a reader's words are: the app's own frame is not (user-select: none).
    words.style.userSelect = 'text'
    words.focus()
    const range = document.createRange()
    range.selectNodeContents(words)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await wait(200)
  const picked = await h.evaluate(() => `${String(getSelection())} (focus on ${document.activeElement?.id || document.activeElement?.tagName})`)
  await h.keyboard.press('Meta+c')
  await wait(300)
  got = await copiedKinds(electron)
  check('⌘C of words picked on a page puts those words on the stand-in, and as HTML', got['text/plain'] === 'Words on the page itself.' && got['text/html'] === 'Words on the page itself.', `${JSON.stringify(got)}; picked: ${picked}`)
  await h.evaluate(() => {
    document.querySelector('#qa-words').remove()
    const field = Object.assign(document.body.appendChild(document.createElement('input')), { id: 'qa-field', value: 'field words' })
    field.focus()
    field.select()
  })
  await h.keyboard.press('Meta+x')
  await wait(300)
  check('⌘X in a field puts its picked words on the stand-in and takes them out', (await copiedText(electron)) === 'field words' && (await h.evaluate(() => document.querySelector('#qa-field').value)) === '', JSON.stringify(await copiedText(electron)))

  // 6. A paste nobody takes puts the words in the field, as the browser's own paste does.
  const taken = await paste(h, 'pasted in a field')
  check('a paste into a field nobody takes it for puts the words there', !taken && (await h.evaluate(() => document.querySelector('#qa-field').value)) === 'pasted in a field', await h.evaluate(() => document.querySelector('#qa-field').value))
  check('and a paste aimed at nothing that is there does nothing', (await paste(h, 'nowhere', '#not-on-the-page')) === false)
  await h.evaluate(() => document.querySelector('#qa-field').remove())

  // 7. Pastes into a note: words, HTML, a picture, a file on disk, and what was copied.
  sel = await note('Pasted into')
  await paste(h, 'Plain pasted words.')
  await wait(400)
  check('a paste of words lands in the note', (await inNote(sel)).text.includes('Plain pasted words.'), (await inNote(sel)).text)
  await paste(h, { 'text/plain': 'A link', 'text/html': '<a href="https://example.com/pasted">A link</a>' })
  await wait(400)
  check('a paste with HTML lands as HTML (a link stays a link)', (await inNote(sel)).links.includes('https://example.com/pasted'), JSON.stringify((await inNote(sel)).links))
  await paste(h, { files: [{ name: 'image.png', type: 'image/png', bytes: PNG }] })
  await wait(1500)
  check('a paste of a picture lands as a picture', (await inNote(sel)).pictures === 1, JSON.stringify(await inNote(sel)))
  const dir = join(process.env.QA_DATA, 'q3-copied-in-finder')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'reading-list.txt'), 'Middlemarch\n')
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel)
  await paste(h, { paths: [join(dir, 'reading-list.txt')] })
  await wait(1500)
  check('a paste of a file on disk lands as its card (its place on disk came with it)', (await inNote(sel)).cards.includes('reading-list.txt'), JSON.stringify(await inNote(sel)))
  check('and the file input it came through is gone', !(await h.evaluate(() => document.querySelector('input[type=file][hidden]'))))
  await putOnBoard(electron, 'Words from the stand-in.')
  await h.evaluate((sel) => document.querySelector(sel).editor.commands.focus('end'), sel)
  await pasteCopied(electron, h)
  await wait(400)
  check("pasteCopied pastes what is on the stand-in, as ⌘V would", (await inNote(sel)).text.includes('Words from the stand-in.'), (await inNote(sel)).text)
  check('no page errors', !c.errors?.length, (c.errors ?? []).slice(0, 3).join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error).split('\n').slice(0, 3).join(' '))
} finally {
  await c.close()
  done()
}
