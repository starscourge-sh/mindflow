// Cards from what you paste and write in a note: a spreadsheet's two columns
// pasted into a note land as "question :: answer" lines (header row left
// out, said in the toast, "Show them" picks them), pasting again adds nothing
// twice, a Markdown table stays a table; a maths line keeps its formulas and
// Review draws them.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/note-paste-cards.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
// A fresh book, not the sandbox: Review then asks only the cards made here.
process.env.QA_ARGS = ''
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900, seeded: false })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const v = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const paste = (plain, html = '') => h.evaluate(([plain, html]) => {
  const data = new DataTransfer()
  data.setData('text/plain', plain)
  if (html) data.setData('text/html', html)
  document.querySelector('.ProseMirror').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
}, [plain, html])
const lines = () => h.evaluate(() => [...document.querySelectorAll('.ProseMirror p')].map((one) => one.textContent).filter(Boolean))
const toastText = () => h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent).join(' | '))
const cardsOf = async (id) => (await v('items', 'card')).filter((one) => one.lineOf === `capture:${id}`)

try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  await h.reload()
  await h.waitForTimeout(2000)
  const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell biology' }] }, { type: 'paragraph' }] }
  const id = await h.evaluate((body) => window.api.captures.create({ body }), body)
  await c.send('capture', id)
  await waitFor(() => h.evaluate(() => !!document.querySelector('.ProseMirror')))
  await h.waitForTimeout(800)
  await h.evaluate(() => {
    const last = [...document.querySelectorAll('.ProseMirror p')].at(-1)
    const range = document.createRange()
    range.setStart(last, 0)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
    document.querySelector('.ProseMirror').focus()
  })
  const SHEET = 'Term\tDefinition\nmitochondria\tpowerhouse of the cell\nribosome\tmakes proteins\nnucleus\tholds the DNA'
  await paste(SHEET, '<table><tr><td>Term</td><td>Definition</td></tr></table>')
  check('a two-column spreadsheet lands as three :: lines', await waitFor(async () => (await lines()).filter((one) => one.includes(' :: ')).length === 3), JSON.stringify(await lines()))
  check('the header row is not a card, and the toast says so', await waitFor(async () => /3 cards.*named the columns/.test(await toastText())), await toastText())
  check('each line has its card mark', await waitFor(() => h.evaluate(() => document.querySelectorAll('.mf-line-card').length === 3)))
  if (shots) await h.screenshot({ path: join(shots, 'note-paste-cards.png') })
  await h.evaluate(() => [...document.querySelectorAll('[role="status"] button')].find((one) => one.textContent?.includes('Show them'))?.click())
  check('"Show them" picks the pasted lines', await waitFor(async () => (await h.evaluate(() => getSelection()?.toString() ?? '')).startsWith('mitochondria :: ') && (await h.evaluate(() => getSelection()?.toString() ?? '')).includes('nucleus :: holds the DNA')), await h.evaluate(() => getSelection()?.toString()))
  await h.keyboard.press('ArrowRight')
  await paste(SHEET)
  check('pasting the same list again adds nothing twice', await waitFor(async () => /already in this note/.test(await toastText())) && (await lines()).filter((one) => one.includes(' :: ')).length === 3, JSON.stringify(await lines()))
  await paste('| Name | Year |\n|---|---|\n| Monet | 1872 |')
  await h.waitForTimeout(600)
  check('a Markdown table is not made into cards', (await lines()).filter((one) => one.includes(' :: ')).length === 3, JSON.stringify(await lines()))
  // Saved, the lines are the note's own cards.
  await h.keyboard.press('Meta+s')
  check('the pasted lines become the note\'s cards', await waitFor(async () => (await cardsOf(id)).length === 3, 10000), JSON.stringify((await cardsOf(id)).map((one) => one.prompt)))

  // A maths line: a stored formula keeps it, and Review draws it.
  const maths = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'What is the derivative of ' }, { type: 'inlineMath', attrs: { latex: 'x^2' } }, { type: 'text', text: '? :: ' }, { type: 'inlineMath', attrs: { latex: '2x' } }] }] }
  const mathsId = await h.evaluate((body) => window.api.captures.create({ body }), maths)
  const [card] = await cardsOf(mathsId)
  check('a line with formulas is a card, formulas kept', card?.prompt === 'What is the derivative of $x^2$?', JSON.stringify(card?.prompt))
  await c.send('capture', mathsId)
  check('its card mark shows in the note', await waitFor(() => h.evaluate(() => document.querySelectorAll('.mf-line-card').length === 1)))
  await v('cards:pause', (await cardsOf(id)).map((one) => one.id), true); await h.waitForTimeout(600)
  await c.go('review')
  check('Review draws the formula in the question', await waitFor(() => h.evaluate(() => [...document.querySelectorAll('h2 .katex')].length > 0)), await h.evaluate(() => document.querySelector('h2')?.textContent))
  if (shots) {
    for (const theme of ['paper', 'dark']) {
      await c.theme(theme); await c.go('review')
      await h.waitForTimeout(600)
      await h.screenshot({ path: join(shots, `review-formula-${theme}.png`) })
    }
    await c.theme('paper')
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
