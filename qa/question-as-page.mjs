// A question in Pages reads as a page with clues: the same header row, its
// words as the title on the editor's column in the page title's type, a quiet
// meta line, then its body, clues and mentions, all on one left edge. Its
// "Read the clues", "+" and "Answered" are ordinary buttons that work.
// Screenshots of a page and a question, light and dark, go to SHOTS.
//
//   npx electron-vite build --outDir out-x && QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/question-as-page.mjs
import { mkdirSync } from 'node:fs'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const shots = process.env.SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1600, height: 1000 })
const { h, v, go, send } = c
const measure = () => h.evaluate(() => {
  const pane = document.querySelector('.note-pane[data-open]:not([data-coming])')
  const title = pane?.querySelector('textarea')
  const editor = pane?.querySelector('.tiptap.ProseMirror')
  const column = title?.closest('.note-column')
  if (!title || !editor || !column) return null
  const style = getComputedStyle(title)
  const ed = editor.getBoundingClientRect()
  const pad = parseFloat(getComputedStyle(editor).paddingLeft)
  const col = column.getBoundingClientRect()
  const colPad = parseFloat(getComputedStyle(column).paddingLeft)
  const rows = [...pane.querySelectorAll('[data-question-clues] li')].map((one) => Math.round(one.firstElementChild.getBoundingClientRect().left))
  const heading = pane.querySelector('[data-question-clues] h3')?.getBoundingClientRect().left
  const wide = [...pane.querySelectorAll('[data-question-head] *, [data-question-clues] *')].filter((one) => one.getBoundingClientRect().right > col.right + 1).map((one) => one.tagName + '.' + String(one.className).slice(0, 40))
  return {
    title: Math.round(title.getBoundingClientRect().left), size: style.fontSize, weight: style.fontWeight, family: style.fontFamily,
    body: Math.round(ed.left + pad), colWidth: Math.round(col.width), colLeft: Math.round(col.left + colPad), rows, heading: heading && Math.round(heading), wide,
    hero: !!pane.querySelector('[data-collection-header]'), how: !!pane.querySelector('[data-question-how]')
  }
})
const open = async (type, id) => {
  await send(type, id)
  await h.waitForTimeout(1200)
}
try {
  await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
  const article = await v('article:new')
  await v('item:save', article, { title: 'How tides work' })
  const q = await v('question:new', 'Why do tides lag behind the moon?')
  await v('clue', q, 'The water has to move a long way.')
  await new Promise((done) => setTimeout(done, 30))
  await v('clue', q, 'Friction with the sea floor slows it.')
  await go('articles')

  await open('article', article)
  const page = await measure()
  if (shots) await h.screenshot({ path: `${shots}/page-light.png` })
  await open('question', q)
  const quest = await measure()
  if (shots) await h.screenshot({ path: `${shots}/question-light.png` })
  check('both open', !!page && !!quest, JSON.stringify({ page, quest }))
  check('the title starts on the same edge', Math.abs(page.title - quest.title) <= 2, `${page.title} / ${quest.title}`)
  check('the title has the same size and weight', page.size === quest.size && page.weight === quest.weight && page.family === quest.family, `${page.size} ${page.weight} / ${quest.size} ${quest.weight}`)
  check('the body editor starts on the same edge', Math.abs(page.body - quest.body) <= 2, `${page.body} / ${quest.body}`)
  check('title and body share one edge on the question', Math.abs(quest.title - quest.body) <= 2, `${quest.title} / ${quest.body}`)
  check('the clue rows and their heading start on that edge', quest.rows.length === 2 && quest.rows.every((x) => Math.abs(x - quest.title) <= 2) && Math.abs(quest.heading - quest.title) <= 2, JSON.stringify([quest.rows, quest.heading, quest.title]))
  check('no part is wider than the page column', quest.colWidth === page.colWidth && !quest.wide.length, `${page.colWidth} / ${quest.colWidth} ${quest.wide.join(',')}`)
  check('no cover hero; with clues, no help paragraph', !quest.hero && !quest.how)
  const meta = await h.locator('[data-question-meta]').textContent()
  check('one quiet meta line under the title', /^Question · 2 clues/.test(meta) && /last clue/.test(meta), meta)

  // The actions work.
  await h.locator('[data-question-add]').click()
  await h.waitForTimeout(400)
  await h.keyboard.type('The moon pulls on the bulge.')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const count = await h.locator('[data-question-clues] li').count()
  check('"+" adds a clue that shows', count === 3, String(count))
  await h.locator('[data-question-read]').click()
  await h.waitForTimeout(800)
  check('"Read the clues" opens the reader', (await h.locator('[data-read-through], .mf-read').count()) > 0)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)

  // Dark, side by side as before.
  if (shots) {
    await c.theme('dark')
    await go('articles')
    await open('question', q)
    await h.screenshot({ path: `${shots}/question-dark.png` })
    await open('article', article)
    await h.screenshot({ path: `${shots}/page-dark.png` })
    await c.theme('light')
    await go('articles')
  }

  // With no clues: the help line on the same edge, in body type.
  const fresh = await v('question:new', 'What makes a habit stick?')
  await open('question', fresh)
  const empty = await h.evaluate(() => {
    const how = document.querySelector('[data-question-how]')
    const title = document.querySelector('.note-pane[data-open] textarea')
    return how && { left: Math.round(how.getBoundingClientRect().left), title: Math.round(title.getBoundingClientRect().left) }
  })
  check('with no clues, the help line shows on the title edge', !!empty && Math.abs(empty.left - empty.title) <= 2, JSON.stringify(empty))
  if (shots) await h.screenshot({ path: `${shots}/question-empty-light.png` })

  // Answered makes a page.
  await open('question', q)
  await h.locator('[data-question-answered]').click()
  await h.waitForTimeout(1200)
  const after = await v('item', q)
  check('"Answered" closes it', !!after?.closedAt, JSON.stringify(after?.closedAt))
  check('no page errors', !c.errors.length, c.errors.join(' | '))
} finally {
  await c.close()
  done()
}
