// Translate offered only where it helps, and a missing language fetched through Apple's own prompt (macOS 26):
// in an English book, picked "xiao Jing" (a romanised name) offers no Translate, only Look up; a picked Spanish
// sentence offers it. Chosen, with Spanish not on the Mac, the notice is news, not an error (no red cross), says
// what it needs in plain words and has one button, "Get Spanish", which opens Apple's prompt and translates when
// it lands. Apple's prompt is a stand-in here (HALIGTREE_QA_TRANSLATE_PREPARE=ok): nothing is ever downloaded.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-translate.mjs
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { checks } from './harness.mjs'

process.env.HALIGTREE_QA_CAPS = 'macos26'
process.env.HALIGTREE_QA_TRANSLATE_PREPARE = 'ok'
const { sandbox } = await import('./sandbox-lib.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const ENGLISH = 'The scholar xiao Jing kept a commonplace book of sayings.'
const SPANISH = 'El que lee mucho y anda mucho, ve mucho y sabe mucho.'
const pick = (line, words) => h.evaluate(([line, words]) => {
  const span = [...document.querySelectorAll('.pdf-reader .textLayer span')].find((one) => one.textContent.includes(line.slice(0, 12)))
  if (!span) return null
  const at = span.firstChild.textContent.indexOf(words)
  const range = document.createRange()
  range.setStart(span.firstChild, at)
  range.setEnd(span.firstChild, at + words.length)
  getSelection().removeAllRanges()
  getSelection().addRange(range)
  const r = range.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}, [line, words])
const menu = async (at) => {
  await wait(600)
  await h.mouse.click(at.x, at.y, { button: 'right' })
  await wait(500)
  return h.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((one) => one.textContent.trim()))
}
try {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([520, 300])
  page.drawText(ENGLISH, { x: 20, y: 240, size: 13, font })
  page.drawText(SPANISH, { x: 20, y: 200, size: 13, font })
  const bytes = Array.from(await pdf.save())
  const article = await v('article:new')
  await v('item:save', article, { title: 'Reading', body: { type: 'doc', content: [{ type: 'paragraph' }] } })
  await send('article', article)
  await wait(1400)
  await h.evaluate((bytes) => {
    const ed = document.querySelector('[data-open] .tiptap').editor
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'sayings.pdf', { type: 'application/pdf' }))
    const box = ed.view.dom.getBoundingClientRect()
    ed.view.dom.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }))
  }, bytes)
  await h.waitForSelector('.is-pdf button[aria-label="Open sayings.pdf"]', { timeout: 15000 }).catch(() => {})
  await h.click('.is-pdf button[aria-label="Open sayings.pdf"]')
  await h.waitForSelector('.pdf-reader .textLayer span', { timeout: 15000 }).catch(() => {})
  await wait(800)
  let at = await pick(ENGLISH, 'xiao Jing')
  let rows = at ? await menu(at) : []
  check('picked “xiao Jing” in an English book offers no Translate, and Look up is there', rows.some((one) => one.startsWith('Look up')) && !rows.some((one) => /Translate/.test(one)), rows.join(' / '))
  await h.keyboard.press('Escape')
  at = await pick(SPANISH, SPANISH)
  rows = at ? await menu(at) : []
  check('a picked Spanish sentence offers Translate', rows.includes('Translate'), rows.join(' / '))
  await h.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find((one) => one.textContent.trim() === 'Translate')?.click())
  await wait(1200)
  const notice = await h.evaluate(() => {
    const words = document.body.innerText.match(/Translating from Spanish[^\n]*/)?.[0] ?? null
    const toast = [...document.querySelectorAll('button')].find((one) => one.textContent.includes('Get Spanish'))?.closest('[class*="bg-popover"]')
    return { words, red: !!toast?.querySelector('.lucide-circle-x'), button: !!toast }
  })
  check('the notice says what it needs in plain words, with “Get Spanish”, and no red cross', /needs Apple's Spanish language, downloaded once/.test(notice.words ?? '') && notice.button && !notice.red, JSON.stringify(notice))
  check('it never sends the person to a written Settings path', !/System Settings, General/.test(await h.evaluate(() => document.body.innerText)))
  if (process.env.SHOT) await c.both(`${process.env.SHOT}/translate-needs`)
  await h.evaluate(() => [...document.querySelectorAll('button')].find((one) => one.textContent.includes('Get Spanish'))?.click())
  await wait(1500)
  const after = await h.evaluate(() => document.body.innerText.match(/In English, from Spanish:[^\n]*/)?.[0] ?? null)
  check('“Get Spanish” opens Apple’s prompt (a stand-in here) and translates once it lands', /a stand-in's translation/.test(after ?? ''), after)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
