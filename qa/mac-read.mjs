// Read it to me (every Mac) and Translate in a book (macOS 26): a note read aloud from ⌘K
// and from its "…" menu, in the language it is written in, each word lit in turn, Esc
// stopping it; words picked in a PDF offer "Read aloud", and "Translate" only on macOS 26.
// Nothing is heard under test: the app lights each word as the voice would and keeps
// what it would have said (window.__readAloud).
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-read.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const book = async () => {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Meditations')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([400, 560])
  page.drawText('El que lee mucho y anda mucho, ve mucho.', { x: 40, y: 460, size: 12, font })
  return Array.from(await pdf.save())
}

async function run(level) {
  process.env.HALIGTREE_QA_CAPS = level
  const c = await sandbox({ width: 1200, height: 860 })
  const { h, v, send } = c
  const wait = (ms) => h.waitForTimeout(ms)
  try {
    await v('settings:set', { hintRate: 0 })
    if (level === 'macos26') {
      const id = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [para('Only our judgements are up to us, and the rest is not.')] })
      await send('capture', id)
      await wait(1600)
      await h.keyboard.press('Meta+k')
      await wait(500)
      await h.keyboard.type('Read it to me', { delay: 20 })
      await wait(700)
      // Every word as the app lights it, kept in the page: sampled from here every 130 ms it raced the app's own
      // 120 ms step (and the time a round trip takes under load), so a word lit between two looks was missed.
      await h.evaluate(() => {
        window.__lit = []
        const set = CSS.highlights.set.bind(CSS.highlights)
        CSS.highlights.set = (name, one) => (name === 'read-aloud' && window.__lit.push([...one][0]?.toString()), set(name, one))
      })
      await h.keyboard.press('Enter')
      await h.waitForFunction(() => window.__lit.length >= 4, null, { timeout: 8000 }).catch(() => {})
      const lit = await h.evaluate(() => window.__lit.filter((one, i, all) => all.indexOf(one) === i))
      const said = await h.evaluate(() => window.__readAloud.at(-1))
      check('⌘K “Read it to me” reads the note in English', said?.language === 'en' && /judgements are up to us/.test(said?.text ?? ''), JSON.stringify(said))
      check('each word is lit as it is said, in order', lit.length >= 4 && lit[0] === 'Only' && lit[1] === 'our', lit.join(' '))
      const notice = await h.evaluate(() => document.body.innerText.match(/Reading it aloud, in English\. Esc stops it\./)?.[0] ?? '')
      check('a notice says it is reading, in which language, and how to stop', !!notice, notice)
      await h.keyboard.press('Escape')
      await wait(300)
      const after = await h.evaluate(() => [!!CSS.highlights.get('read-aloud'), !!document.querySelector('[role="dialog"][aria-label="Search"]')])
      check('Esc stops it: nothing lit, and nothing else closes', !after[0], JSON.stringify(after))
      const noticeNow = () => h.evaluate(() => /Reading it aloud/.test(document.body.innerText))
      check('Esc closes the “Reading it aloud” notice too', !(await noticeNow()))
      const readFromK = async () => {
        await h.keyboard.press('Meta+k')
        await wait(500)
        await h.keyboard.type('Read it to me', { delay: 20 })
        await wait(700)
        await h.keyboard.press('Enter')
        await wait(400)
      }
      // To the end of the words: the notice goes with the voice (its own clock would keep it 6 s). Read by the app's
      // own start and end of reading, not by a guess at how long eleven words take: under load the guess ran short.
      await h.evaluate(() => { window.__reading = []; window.addEventListener('haligtree:reading', (event) => window.__reading.push(event.detail)) })
      await readFromK()
      await h.waitForFunction(() => window.__reading[0] === true && /Reading it aloud/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {})
      const during = await noticeNow()
      if (process.env.SHOT) await c.both(`${process.env.SHOT}/read-notice-during`)
      await h.waitForFunction(() => window.__reading.at(-1) === false, null, { timeout: 5000 }).catch(() => {})
      await wait(300)
      if (process.env.SHOT) await c.both(`${process.env.SHOT}/read-notice-after`)
      const ended = await h.evaluate(() => window.__reading.join(','))
      check('read to the end, the notice closes with the voice, no “Stop” left over', during && ended === 'true,false' && !(await noticeNow()), `during ${during}, ${ended}`)
      // A new reading over one still going: the first ends, one notice shows.
      await h.evaluate(() => { window.__reading = [] })
      await readFromK()
      // (⌘K then says “Stop reading”; the note's “…” menu starts a reading anew.)
      await h.getByRole('button', { name: 'More' }).first().click()
      await wait(400)
      await h.getByRole('menuitem', { name: /Read it to me/ }).click()
      await h.waitForFunction(() => window.__reading.length >= 3, null, { timeout: 5000 }).catch(() => {})
      const turns = await h.evaluate(() => window.__reading.join(','))
      check('a new reading ends the one going first, and one notice shows', turns === 'true,false,true' && (await noticeNow()), turns)
      // Leaving the page: the voice and its notice stop.
      await c.go('inbox')
      await wait(900)
      const left = await h.evaluate(() => [window.__reading.at(-1), !!CSS.highlights.get('read-aloud')])
      check('leaving the page stops it, and closes the notice', left[0] === false && !left[1] && !(await noticeNow()), JSON.stringify(left))
      await send('capture', id)
      await wait(1200)

      // A Spanish note, from its "…" menu.
      const es = await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [para('El que lee mucho y anda mucho, ve mucho y sabe mucho.')] })
      await send('capture', es)
      await wait(1600)
      await h.getByRole('button', { name: 'More' }).first().click()
      await wait(400)
      const before = await h.evaluate(() => window.__readAloud.length)
      await h.getByRole('menuitem', { name: /Read it to me/ }).click()
      // The language is asked of the Mac first: wait for the reading itself, not a fixed half second.
      await h.waitForFunction((n) => window.__readAloud.length > n, before, { timeout: 5000 }).catch(() => {})
      const spanish = await h.evaluate(() => window.__readAloud.at(-1))
      check('“Read it to me” in a note’s “…” menu reads a Spanish note in Spanish', spanish?.language === 'es', JSON.stringify(spanish))
      await h.keyboard.press('Escape')
      await wait(300)
    }

    // A book: words picked, right-clicked.
    const article = await v('article:new')
    await v('item:save', article, { title: 'Reading', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
    await send('article', article)
    await wait(1400)
    const bytes = await book()
    await h.evaluate((bytes) => {
      const ed = document.querySelector('[data-open] .tiptap').editor
      const data = new DataTransfer()
      data.items.add(new File([new Uint8Array(bytes)], 'meditations.pdf', { type: 'application/pdf' }))
      const box = ed.view.dom.getBoundingClientRect()
      ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
    }, bytes)
    await h.waitForSelector('.is-pdf button[aria-label="Open meditations.pdf"]', { timeout: 15000 }).catch(() => {})
    await h.click('.is-pdf button[aria-label="Open meditations.pdf"]')
    await h.waitForSelector('.pdf-reader .pdf-page[data-page="1"] .textLayer span', { timeout: 15000 }).catch(() => {})
    await wait(800)
    const at = await h.evaluate(() => {
      const span = [...document.querySelectorAll('.pdf-reader .pdf-page[data-page="1"] .textLayer span')].find((one) => /lee mucho/.test(one.textContent))
      if (!span) return null
      const range = document.createRange()
      range.setStart(span.firstChild, 0)
      range.setEnd(span.firstChild, span.firstChild.textContent.length)
      getSelection().removeAllRanges()
      getSelection().addRange(range)
      const r = range.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    check(`${level}: the book's words can be picked`, !!at)
    if (at) {
      // A person's pause between picking and right-clicking: the Mac is asked the words' language as the pick rests.
      await wait(400)
      await h.mouse.click(at.x, at.y, { button: 'right' })
      await wait(500)
      const rows = await h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
      check(`${level}: picked words offer “Read aloud”`, rows.includes('Read aloud'), rows.join(' / '))
      check(`${level}: “Translate” is offered ${level === 'macos26' ? 'here' : 'nowhere (it needs macOS 26)'}`, rows.includes('Translate') === (level === 'macos26'))
      if (process.env.SHOT && level === 'macos26') await c.both(`${process.env.SHOT}/read-book-menu`)
      const before = await h.evaluate(() => window.__readAloud.length)
      await h.getByRole('menuitem', { name: 'Read aloud' }).click()
      await h.waitForFunction((n) => window.__readAloud.length > n, before, { timeout: 5000 }).catch(() => {})
      const said = await h.evaluate(() => window.__readAloud.at(-1))
      check(`${level}: “Read aloud” reads the picked words in Spanish`, said?.language === 'es' && /lee mucho/.test(said.text), JSON.stringify(said))
      await h.keyboard.press('Escape')
    }
    check(`${level}: no page errors`, !c.errors.length, c.errors.slice(0, 3).join(' | '))
  } finally {
    await c.close()
  }
}

await run('macos26')
await run('macos15')
done()
