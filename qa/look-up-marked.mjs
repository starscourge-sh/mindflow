// The looked-up words stay marked where they sit while the Look Up card is
// open, in a note and in a PDF, even once "Why keep this?" takes the focus;
// the mark goes when the card closes, and the page is never changed.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/look-up-marked.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { lookupServer, openProbePdf, pickInPdf, markedWords } from './probe-pdf-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const server = await lookupServer()
const { check, done } = checks()
const c = await sandbox({ width: 1300, height: 900 })
const { h, v } = c
const shots = process.env.QA_SHOTS ?? '/tmp'
const wait = (ms) => h.waitForTimeout(ms)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // A note: "quiet" picked and looked up from the right-click menu.
  const note = await v('article:new')
  await v('item:save', note, { title: 'Harbour', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A quiet harbour where the boats sleep.' }] }] } })
  await c.send('article', note); await wait(1400)
  const at = await h.evaluate(() => {
    const ed = [...document.querySelectorAll('[data-open] .tiptap')].find((one) => one.textContent.includes('quiet harbour'))
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT)
    let text = walker.nextNode()
    while (text && !text.data.includes('quiet')) text = walker.nextNode()
    const from = text.data.indexOf('quiet')
    const range = document.createRange()
    range.setStart(text, from); range.setEnd(text, from + 5)
    getSelection().removeAllRanges(); getSelection().addRange(range)
    const r = range.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  await wait(300)
  await h.mouse.click(at.x, at.y, { button: 'right' }); await wait(500)
  await h.locator('[data-look-menu] [role="menuitem"]:has-text("Look up"), [data-clicked="look-up"]').first().click({ timeout: 5000 }); await wait(1500)
  check('in a note, the card opens on the word', (await h.evaluate(() => document.querySelector('[data-look-up-host] .look-up-headword')?.textContent)) === 'quiet', '')
  check('and the word stays marked in place while it is open', (await markedWords(h)) === 'quiet', `${await markedWords(h)} ${await h.evaluate(() => [CSS.highlights.has('look-up'), document.querySelectorAll('.look-up').length])}`)
  await h.evaluate(() => getSelection().removeAllRanges()); await wait(200)
  check('even with nothing picked any more', (await markedWords(h)) === 'quiet', await markedWords(h))
  await h.screenshot({ path: `${shots}/look-up-marked-note.png` })
  const body = await v('item', note)
  check('the note itself is not changed (no mark written in)', !JSON.stringify(body?.body).includes('highlight'), '')
  await h.keyboard.press('Escape'); await wait(300)
  check('Esc closes the card and the mark goes with it', (await markedWords(h)) === '' && !(await h.evaluate(() => !!document.querySelector('.look-up'))), `${await markedWords(h)} ${await h.evaluate(() => document.querySelectorAll('.look-up').length)}`)

  // A PDF: L looks the picked words up; Keep, then "Why keep this?" takes the focus; the mark stays.
  await openProbePdf(c)
  await pickInPdf(h, 2, 7); await wait(400)
  await h.keyboard.press('l'); await wait(1500)
  check('in a PDF, L opens the card on the word', (await h.evaluate(() => document.querySelector('.pdf-reader .look-up-headword')?.textContent)) === 'quiet', '')
  check('and the word stays marked in the page', (await markedWords(h)) === 'quiet', await markedWords(h))
  await h.screenshot({ path: `${shots}/look-up-marked-pdf.png` })
  await h.click('[data-look-keep]'); await wait(900)
  check('"Why keep this?" takes the focus', await h.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Why keep this'), '')
  check('and the word is still marked', (await markedWords(h)) === 'quiet', await markedWords(h))
  await h.screenshot({ path: `${shots}/look-up-marked-pdf-why.png` })
  await c.look('dark'); await wait(500)
  await h.screenshot({ path: `${shots}/look-up-marked-pdf-dark.png` })
  await c.look('light'); await wait(300)
  await h.keyboard.press('Escape'); await wait(200)
  await h.keyboard.press('Escape'); await wait(400)
  check('closed, the mark goes', (await markedWords(h)) === '' && !(await h.evaluate(() => !!document.querySelector('.look-up'))), await markedWords(h))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
  await server.close()
}
done()
