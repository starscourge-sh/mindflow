// An everyday learner writes card lines ("question :: answer") in a note, the first of a list included, every way a
// line can be written: each shows the card mark. A click on the second's mark opens its card beside the note, with
// its question; ⌘-click on another opens it in a new tab; the card's page offers "Open it at the line", which lands
// back on that line of the note.
//   QA_DATA=<sandbox copy> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/line-card-open.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 900 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const t = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) })
const p = (...content) => ({ type: 'paragraph', content })
const li = (...content) => ({ type: 'listItem', content: [p(...content)] })
const body = { type: 'doc', content: [
  p(t('Kepler, for the exam.')),
  { type: 'bulletList', content: [li(t('First law :: Every planet moves in an ellipse.')), li(t('Second law :: Equal areas in equal times.')), li(t('Third law :: The square of the year goes as the cube of the orbit.'))] },
  { type: 'orderedList', content: [li(t('Numbered :: one'))] },
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [p(t('Task line :: done'))] }] },
  { type: 'blockquote', content: [p(t('Quoted :: said'))] },
  p(t('Bold', [{ type: 'bold' }]), t(' line :: strong')),
  p(t('Linked', [{ type: 'link', attrs: { href: 'https://example.org' } }]), t(' line :: away')),
  p(t('Plain line :: last')),
] }
const SAID = ['First law', 'Second law', 'Third law', 'Numbered', 'Task line', 'Quoted', 'Bold line', 'Linked line', 'Plain line']
const EDITOR = '[data-open] .tiptap:not(.is-line):not(.is-plain)'
// The mark at the end of the line starting with these words, found in the note's own editor.
const markOf = (words) => h.locator(`${EDITOR} p:has(> .mf-line-card)`).filter({ hasText: words }).first().locator('.mf-line-card')
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const id = await v('article:new')
  await v('item:save', id, { title: 'Kepler', body })
  await c.send('article', id); await wait(1800)
  const marked = await h.evaluate((sel) => [...document.querySelector(sel).querySelectorAll('.mf-line-card')].map((one) => one.parentElement.textContent.split(' ::')[0].trim()), EDITOR)
  check('every way of writing a card line shows its mark, the first of a list included', SAID.every((one) => marked.includes(one)) && marked.length === SAID.length, JSON.stringify(marked))
  // The cards are made just after the note saves (main/line-cards.ts lineCardsSoon): waited for, 10 s at most.
  let cards = []
  // `cards:all` gives no `lineOf`, only `made: 'line'` for a card written as a line (main/haligtree.ts 'cards:all').
  const ours = () => cards.filter((card) => card.made === 'line' && SAID.includes(card.prompt))
  for (let i = 0; i < 20 && !SAID.every((one) => ours().some((card) => card.prompt === one)); i++) (await wait(500), (cards = await v('cards:all')))
  check('each line is a card', SAID.every((one) => ours().some((card) => card.prompt === one)), `${JSON.stringify(ours().map((card) => card.prompt))}; a row: ${JSON.stringify(cards.find((card) => card.made === 'line') ?? cards[0] ?? null)?.slice(0, 300)}`)
  // A hover says what a click does.
  const second = markOf('Second law')
  check('the mark says it opens its card', (await second.getAttribute('data-title-tip'))?.startsWith('Open its card'), await second.getAttribute('data-title-tip'))
  check('the mark shows the hand', (await second.evaluate((one) => getComputedStyle(one).cursor)) === 'pointer')
  await second.click(); await wait(1500)
  const beside = await h.locator('[data-card-line-from]').count()
  const asked = await h.locator('body').innerText()
  check('a click opens the second card beside the note, with its question', beside > 0 && asked.includes('Second law') && (await h.locator(EDITOR).count()) >= 1, `card pages ${beside}`)
  // ⌘-click: a new tab.
  const tabsBefore = await h.locator('[role="tab"]').count()
  await markOf('Third law').click({ modifiers: ['Meta'] }); await wait(1500)
  check('⌘-click opens it in a new tab', (await h.locator('[role="tab"]').count()) > tabsBefore, `${tabsBefore} → ${await h.locator('[role="tab"]').count()}`)
  // The card's page: the way back lands on the line.
  await h.locator('[data-card-line-open]').last().click(); await wait(1800)
  // Read in the note's own editor (the one holding the card lines), never the card page's, whose words are the answer.
  const landed = await h.evaluate(() => {
    const ed = [...document.querySelectorAll('.tiptap')].map((one) => one.editor).find((one) => one?.state.doc.textContent.includes('Second law ::'))
    return ed ? ed.state.doc.resolve(ed.state.selection.from).parent.textContent : 'no editor holds the note'
  })
  check('"Open it at the line" lands on that line of the note', /^(Second|Third) law ::/.test(landed), landed)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
