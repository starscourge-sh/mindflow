// Looking inside what is in the Bin before restoring it or deleting it for good.
// On the sandbox, one of each kind the Bin holds goes in, then:
//   1. a click on each shows its words beside the list, read only: the
//      editor is not editable, and typing into it changes nothing;
//   2. Space opens Quick Look on the row, ↑ ↓ step while it stays, Esc and
//      Space close it;
//   3. “Restore” in the preview puts it back where it was;
//   4. a row still called “Untitled” shows its first line, in muted ink;
//   5. pointing at a title shows the hover card an @ link shows.
// SHOTS=dir keeps pictures at 900x700 and 1600x1000, light and dark.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/bin-preview.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1400, height: 900 })
const { h, v, go } = c
const BIN = '[data-page="discarded"]'
const doc = (...lines) => ({ type: 'doc', content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })) })
// A small picture, so the preview is seen to carry pictures too.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAHklEQVR4nGP8z8DAQApgIkn1qIZRDaMaRjUMKw0AW0YBH5Bv0e4AAAAASUVORK5CYII='

try {
  // One of each kind, each with words to look for.
  const made = []
  const capture = async (kind, words, extra = []) => {
    const id = await h.evaluate(([kind, body]) => window.api.captures.create({ kind, body }), [kind, { type: 'doc', content: [...doc(...words).content, ...extra] }])
    await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded' }), id)
    made.push({ type: 'capture', kind, id, words: words.at(-1) })
  }
  await capture('note', ['Binned probe note', 'Seen through the window: the river in the rain.'], [{ type: 'image', attrs: { src: PNG } }])
  await capture('quote', ['“Binned probe quote: the map is not the land.”'])
  await capture('link', ['Binned probe link', 'https://example.com/binned-probe'])
  await capture('word', ['Binned probe word: petrichor, the smell of rain'])
  await capture('decision', ['Binned probe decision: walk to work in October'])
  await capture('experiment', ['Binned probe experiment: no phone before nine'])
  // A gem, an article (still “Untitled”), a question and a goal, each put in the Bin.
  const gem = await v('nugget:from', 'Binned probe gem: rest is part of the work', {})
  const article = await v('article:new')
  await v('item:save', article, { body: doc('Binned probe article first line', 'And a second paragraph under it.') })
  const question = await v('question:new', 'Binned probe question: why do rivers bend?')
  await v('item:save', question, { body: doc('Clue: the outside of a bend wears away faster.') })
  const target = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const goal = await v('goal:new', 'Binned probe goal: run ten kilometres', target)
  await v('item:save', goal, { body: doc('Three runs a week, one of them long.') })
  for (const id of [gem, article, question, goal].filter(Boolean)) await v('bin:put', id)
  made.push({ type: 'nugget', id: gem, words: 'rest is part of the work' })
  made.push({ type: 'article', id: article, words: 'And a second paragraph under it.' })
  made.push({ type: 'question', id: question, words: 'the outside of a bend wears away faster' })
  if (goal) made.push({ type: 'goal', id: goal, words: 'Three runs a week' })
  // A task closed without doing, with notes.
  const task = await v('task:add', 'Binned probe task: mend the fence #garden')
  const taskId = typeof task === 'string' ? task : task?.id
  await v('task:save', taskId, { notes: doc('Posts from the shed, nails in the blue tin.'), status: 'dropped' })
  made.push({ type: 'task', id: taskId, words: 'nails in the blue tin' })

  // A calendar event and a practice, each binned.
  const event = await v('event:add', { title: 'Binned probe event: dentist', place: 'High Street', notes: 'Bring the referral letter.' })
  await v('event:drop', event.key)
  made.push({ type: 'event', id: event.key, words: 'Bring the referral letter.' })
  const practice = await v('practices:save', { name: 'Binned probe practice: scales on the piano', days: [1, 3, 5], at: '07:30', targetMin: 20 })
  await v('practices:bin', practice)
  made.push({ type: 'practice', id: practice, words: '07:30, 20 minutes' })

  const listed = await v('bin:list')
  check('every kind made is in the Bin', made.every((one) => listed.some((row) => row.id === one.id)), `${made.filter((one) => listed.some((row) => row.id === one.id)).length} of ${made.length}`)

  await go('discarded')
  await h.waitForTimeout(800)
  const row = (id) => h.locator(`${BIN} [data-row][data-id="${id}"]`).first()

  // 1. A click shows each one's words beside the list, read only.
  for (const one of made) {
    await row(one.id).click({ position: { x: 30, y: 10 } })
    await h.waitForFunction((id) => document.querySelector(`[data-bin-preview]`)?.dataset.open === id && document.querySelector('[data-bin-inside] .ProseMirror')?.innerText.length > 0, one.id, { timeout: 4000 }).catch(() => {})
    const seen = await h.evaluate(() => {
      const pane = document.querySelector('[data-bin-preview]')
      const editor = pane?.querySelector('.ProseMirror')
      return { open: pane?.dataset.open, text: pane?.innerText ?? '', editable: editor ? editor.getAttribute('contenteditable') : 'none', anyEditable: !!pane?.querySelector('[contenteditable="true"], input, textarea'), said: !!pane?.querySelector('[data-bin-readonly]') && /In the Bin\. Restore it to change it\./.test(pane.innerText), dates: /Made .+Moved to the Bin/.test(pane?.innerText ?? ''), pictures: pane?.querySelectorAll('.ProseMirror img').length ?? 0 }
    })
    check(`${one.type}${one.kind ? ` (${one.kind})` : ''}: a click shows its words beside the list`, seen.open === one.id && seen.text.includes(one.words), seen.text.slice(0, 80).replace(/\s+/g, ' '))
    check(`${one.type}${one.kind ? ` (${one.kind})` : ''}: read only, said so, with its dates`, (seen.editable === 'false' || seen.editable === 'none') && !seen.anyEditable && seen.said && seen.dates, `contenteditable=${seen.editable}`)
    if (one.kind === 'note') check('note: its picture shows in the preview', seen.pictures > 0, `${seen.pictures} pictures`)
    // Typing into it changes nothing, on the page or as stored.
    const before = JSON.stringify((await v('bin:peek', one.type === 'capture' ? 'capture' : one.type === 'task' ? 'task' : one.type, one.id))?.body)
    await h.locator('[data-bin-preview] .ProseMirror').first().click({ position: { x: 20, y: 10 } }).catch(() => {})
    await h.keyboard.type('zzqq')
    await h.waitForTimeout(250)
    const after = await h.evaluate(() => document.querySelector('[data-bin-preview] .ProseMirror')?.innerText ?? '')
    const stored = JSON.stringify((await v('bin:peek', one.type, one.id))?.body)
    check(`${one.type}${one.kind ? ` (${one.kind})` : ''}: typing changes nothing`, !after.includes('zzqq') && stored === before)
  }
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/pane-1400.png` })

  // 4. The article still called “Untitled” shows its first line, muted.
  const untitled = await h.evaluate((id) => {
    const name = document.querySelector(`[data-page="discarded"] [data-row][data-id="${id}"] [data-untitled]`)
    return name ? { text: name.textContent, muted: name.className.includes('text-muted-foreground') } : null
  }, article)
  check('the “Untitled” article shows its first line, in muted ink', untitled?.text === 'Binned probe article first line' && untitled.muted, JSON.stringify(untitled))

  // Esc puts the preview away first.
  await h.locator(`${BIN} [data-bin]`).first().click({ position: { x: 5, y: 5 } }).catch(() => {})
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)
  check('Esc puts the preview away', !(await h.evaluate(() => !!document.querySelector('[data-bin-preview]'))))

  // 2. Space: Quick Look on the row the keys are on; ↑ ↓ step; Esc and Space close.
  await row(made[0].id).click({ position: { x: 30, y: 10 } })
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  const lookKey = () => h.evaluate(() => document.querySelector('[data-bin-look] [data-bin-inside]')?.dataset.binInside ?? null)
  await h.keyboard.press(' ')
  await h.waitForTimeout(600)
  const first = await lookKey()
  check('Space opens Quick Look on the row', first === `capture:${made[0].id}`, first)
  if (SHOTS) await h.screenshot({ path: `${SHOTS}/look-1400.png` })
  await h.keyboard.press('ArrowDown')
  await h.waitForTimeout(500)
  const next = await lookKey()
  check('↓ steps to the next row while Quick Look stays', !!next && next !== first, next)
  await h.keyboard.press('ArrowUp')
  await h.waitForTimeout(500)
  check('↑ steps back', (await lookKey()) === first)
  check('Quick Look is read only too', (await h.evaluate(() => document.querySelector('[data-bin-look] .ProseMirror')?.getAttribute('contenteditable'))) === 'false')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)
  check('Esc closes Quick Look', !(await lookKey()))
  await h.keyboard.press(' ')
  await h.waitForTimeout(500)
  const again = await lookKey()
  await h.keyboard.press(' ')
  await h.waitForTimeout(400)
  check('Space opens it again and Space closes it', !!again && !(await lookKey()))

  // 5. Pointing at a title shows the hover card.
  const title = h.locator(`${BIN} [data-row][data-id="${made[1].id}"] [data-note-hover]`).first()
  const box = await title.boundingBox()
  if (box) {
    await h.mouse.move(box.x + 4, box.y + box.height / 2)
    await h.mouse.move(box.x + 12, box.y + box.height / 2, { steps: 4 })
    await h.waitForTimeout(900)
  }
  const card = await h.evaluate(() => document.querySelector('[data-note-preview]')?.innerText ?? '')
  check('pointing at a title shows the hover card, saying it is in the Bin', /map is not the land/.test(card) && /In the Bin/.test(card) && !/Open beside|Add to queue/.test(card), card.replace(/\s+/g, ' ').slice(0, 90))
  await h.mouse.move(5, 5)
  await h.waitForTimeout(400)

  // 3. Restore from the preview puts it back.
  const back = made.find((one) => one.kind === 'quote')
  await row(back.id).click({ position: { x: 30, y: 10 } })
  await h.waitForTimeout(500)
  await h.locator('[data-bin-preview] [data-bin-readonly] button', { hasText: 'Restore' }).first().click()
  await h.waitForTimeout(900)
  const still = (await v('bin:list')).some((one) => one.id === back.id)
  const capture2 = await h.evaluate((id) => window.api.captures.get(id), back.id)
  check('“Restore” in the preview puts it back where it was', !still && capture2?.status !== 'discarded', capture2?.status)

  // What already worked still does: ⌘A picks every row; ⌘Z takes the restore back.
  await h.evaluate(() => document.activeElement?.blur?.())
  await h.keyboard.press('Meta+z')
  await h.waitForTimeout(900)
  check('⌘Z puts the restored one back in the Bin', (await v('bin:list')).some((one) => one.id === back.id))
  await h.keyboard.press('Escape')
  await h.keyboard.press('Escape')
  await row(made[0].id).click({ position: { x: 30, y: 10 } })
  await h.keyboard.press('Meta+a')
  await h.waitForTimeout(400)
  const picked = await h.evaluate(() => document.querySelectorAll('[data-page="discarded"] [data-row][data-picked]').length)
  const rows = await h.evaluate(() => document.querySelectorAll('[data-page="discarded"] [data-row]').length)
  check('⌘A still picks every row', picked > 1 && picked === rows, `${picked} of ${rows}`)
  await h.keyboard.press('Escape')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)

  // The same card elsewhere: a note in quick capture's @ menu shows what it holds, beside the menu.
  const qbox = c.page
  await qbox.evaluate(() => window.api.showPrompt())
  await qbox.waitForTimeout(700)
  await qbox.locator('.tiptap.ProseMirror.mindflow-editor').first().click()
  await qbox.keyboard.press('Meta+a')
  await qbox.keyboard.press('Backspace')
  await qbox.keyboard.type('@the', { delay: 30 })
  await qbox.waitForTimeout(900)
  const at = qbox.locator('.tiptap-note-link-title[data-note-hover]').first()
  const atBox = await at.boundingBox().catch(() => null)
  if (atBox) {
    await qbox.mouse.move(atBox.x + 3, atBox.y + atBox.height / 2)
    await qbox.mouse.move(atBox.x + 15, atBox.y + atBox.height / 2, { steps: 4 })
    await qbox.waitForTimeout(1000)
  }
  const atCard = await qbox.evaluate(() => {
    const card = document.querySelector('[data-note-preview]')
    const menu = document.querySelector('[data-note-side]')?.getBoundingClientRect()
    const r = card?.getBoundingClientRect()
    return card ? { text: card.innerText, beside: !!menu && (r.left >= menu.right || r.right <= menu.left) } : null
  })
  check('the @ menu: pointing at a note shows its card beside the menu', !!atCard?.text && atCard.beside, JSON.stringify(atCard)?.slice(0, 120))
  await qbox.keyboard.press('Escape')
  await qbox.keyboard.press('Meta+a')
  await qbox.keyboard.press('Backspace')

  // Pictures: 900x700 and 1600x1000, light and dark, preview and Quick Look.
  if (SHOTS) {
    for (const theme of ['light', 'dark']) {
      await c.theme(theme)
      await go('discarded')
      for (const [w, hh] of [[900, 700], [1600, 1000]]) {
        await c.size(w, hh)
        await row(made[0].id).click({ position: { x: 30, y: 10 } })
        await h.waitForTimeout(900)
        await h.screenshot({ path: `${SHOTS}/pane-${theme}-${w}.png` })
        await h.keyboard.press('Escape')
        await h.waitForTimeout(300)
        await h.keyboard.press(' ')
        await h.waitForTimeout(900)
        await h.screenshot({ path: `${SHOTS}/look-${theme}-${w}.png` })
        await h.keyboard.press('Escape')
        await h.waitForTimeout(300)
        await h.screenshot({ path: `${SHOTS}/list-${theme}-${w}.png` })
      }
    }
  }
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.filter((one) => one.includes('PAGEERROR')).join(' | '))
} finally {
  await c.close()
}
const failed = results.filter((ok) => !ok).length
console.log(`\n${results.length - failed} of ${results.length} passed`)
process.exit(failed ? 1 : 0)
