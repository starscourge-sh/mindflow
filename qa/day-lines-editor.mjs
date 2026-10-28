// Today's lines as one kind of line: Tab and Shift-Tab on lines written before
// and on new ones, Enter after a step (a new step right under it) and on an
// empty step (out a level), @ on a line written before (the task made from the note, with Undo),
// @ typed mid-line on a long line (lit, ranked, clear of the line's tools, Escape, one space, Undo), and "!!!" typed into a line (its priority).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-lines-editor.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1100, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const tasks = () => v('tasks')
const find = async (title) => (await tasks()).find((one) => one.title === title && one.status === 'open')
const lineOf = (id) => h.locator(`[data-day-line="${id}"] [data-line] .ProseMirror`).first()
const stepOf = (id, n) => h.locator(`[data-day-step="${id}:${n}"] .ProseMirror`).first()
const focusIn = (sel) => h.evaluate((sel) => !!document.activeElement?.closest(sel), sel)
const endOf = async (locator) => { await locator.click(); await h.keyboard.press('End'); await wait(150) }
try {
  await v('settings:set', { motion: false, hintRate: 0 })
  // A clear day, so the lines here are the page.
  const tonight = new Date(new Date().setHours(24, 0, 0, 0))
  const later = new Date(Date.now() + 3 * 864e5).toISOString()
  for (const task of await tasks()) {
    if (task.status !== 'open') continue
    if (task.dueAt && new Date(task.dueAt) < tonight) await v('task:save', task.id, { due: later })
    if (task.deadline && new Date(task.deadline) < tonight) await v('task:save', task.id, { deadline: later })
  }
  const note = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Garden plans' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Beans by the fence.' }] }
  ] } }))
  const noteId = typeof note === 'string' ? note : note?.id
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' })))
  await h.reload(); await wait(1500); await go('today'); await wait(1500)

  // Three lines written.
  await h.locator('[data-new="now"] .ProseMirror').click()
  for (const line of ['Qa alpha', 'Qa beta', 'Qa gamma']) {
    await h.keyboard.type(line, { delay: 8 }); await h.keyboard.press('Enter'); await wait(600)
  }
  const alpha = await find('Qa alpha'), beta = await find('Qa beta'), gamma = await find('Qa gamma')
  check('three lines written are three tasks', !!(alpha && beta && gamma))
  check('the caret is on the new line after each', await focusIn('[data-new="now"]'))

  // A line not being written is drawn as text, an editor only once it is pressed: nothing moves as it becomes one.
  const where = (id) => h.evaluate((id) => {
    const line = document.querySelector(`[data-day-line="${id}"] [data-line]`)
    const text = document.createTreeWalker(line, NodeFilter.SHOW_TEXT).nextNode()
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, text.length)
    const box = line.getBoundingClientRect(), words = range.getBoundingClientRect()
    return { editor: !!line.querySelector('[contenteditable]'), at: [box.top, box.height, words.left, words.top, words.width, words.height].map((n) => Math.round(n * 10) / 10) }
  }, id)
  check('lines not being written are drawn as text, no editor each', (await h.evaluate(() => document.querySelectorAll('[data-day-list] [data-day-line] [contenteditable]').length)) <= 1)
  const drawn = await where(gamma.id)
  await lineOf(gamma.id).click({ position: { x: 4, y: 6 } }); await wait(300)
  const writing = await where(gamma.id)
  check('pressed, it becomes an editor with the caret in it, its words where they were to the pixel', !drawn.editor && writing.editor && await focusIn(`[data-day-line="${gamma.id}"]`) && JSON.stringify(drawn.at) === JSON.stringify(writing.at), JSON.stringify({ drawn: drawn.at, writing: writing.at }))
  await h.keyboard.press('Escape'); await wait(300)
  check('left, it is drawn as text again', !(await where(gamma.id)).editor)

  // Tab on a line written before: a step of the one above. Shift-Tab: a line again.
  await endOf(lineOf(beta.id)); await h.keyboard.press('Tab'); await wait(900)
  let a = await v('task', alpha.id)
  check('Tab on a line: a step of the line above', a.subtasks.map((one) => one.text).join() === 'Qa beta' && !(await find('Qa beta')), JSON.stringify(a.subtasks))
  check('the caret follows it into the step', await focusIn(`[data-day-step="${alpha.id}:0"]`))
  await h.keyboard.press('Shift+Tab'); await wait(900)
  a = await v('task', alpha.id)
  const beta2 = await find('Qa beta')
  check('Shift-Tab on the step: a line of its own again', !a.subtasks.length && !!beta2)
  check('the caret is on it', !!beta2 && await focusIn(`[data-day-line="${beta2.id}"]`))

  // Tab on the new line: a step of the last line, its words going with it.
  await h.locator('[data-new="now"] .ProseMirror').click()
  await h.keyboard.type('Qa delta', { delay: 8 }); await h.keyboard.press('Tab'); await wait(400)
  check('Tab on the new line: it is a step being written under the last line', await focusIn(`[data-day-line="${gamma.id}"] [data-draft="step"]`) && (await h.locator('[data-draft="step"] .ProseMirror').innerText()).trim() === 'Qa delta')
  await h.keyboard.press('Enter'); await wait(900)
  let g = await v('task', gamma.id)
  check('Enter makes it a step', g.subtasks.map((one) => one.text).join() === 'Qa delta', JSON.stringify(g.subtasks))

  // Enter after a step: a new step right under it, at the step's place.
  const placed = await h.evaluate((id) => {
    const draft = document.querySelector('[data-draft="step"]')
    const step = document.querySelector(`[data-day-step="${id}:0"] [data-line]`)
    if (!draft || !step) return null
    const one = draft.getBoundingClientRect(), two = step.getBoundingClientRect()
    return { below: one.top >= two.bottom - 2, left: Math.round(one.left - two.left) }
  }, gamma.id)
  check('Enter after a step: a new step directly under it, at its level', !!placed && placed.below && Math.abs(placed.left) <= 2 && await focusIn('[data-draft="step"]'), JSON.stringify(placed))
  await h.keyboard.press('Tab'); await wait(300)
  check('Tab on a new step keeps it (a step is as deep as it goes)', await focusIn('[data-draft="step"]'))
  await h.keyboard.type('Qa epsilon', { delay: 8 }); await h.keyboard.press('Enter'); await wait(900)
  g = await v('task', gamma.id)
  check('typed and Enter: the second step, in order', g.subtasks.map((one) => one.text).join() === 'Qa delta,Qa epsilon', JSON.stringify(g.subtasks))
  // Enter on the empty step: out a level.
  await h.keyboard.press('Enter'); await wait(400)
  check('Enter on an empty new step: out a level, a new line', await focusIn('[data-draft="line"]'))
  await h.keyboard.type('Qa zeta', { delay: 8 }); await h.keyboard.press('Enter'); await wait(900)
  check('typed there, it is a line of its own', !!(await find('Qa zeta')))
  await h.keyboard.press('Escape'); await wait(200)

  // Enter on a step written before, emptied: it comes out a level.
  await endOf(stepOf(gamma.id, 1)); await h.keyboard.press('Meta+a'); await h.keyboard.press('Backspace'); await h.keyboard.press('Enter'); await wait(900)
  g = await v('task', gamma.id)
  check('Enter on an emptied step: the step goes, a new line in its place', g.subtasks.map((one) => one.text).join() === 'Qa delta' && await focusIn('[data-draft="line"]'), JSON.stringify(g.subtasks))
  await h.keyboard.press('Escape'); await wait(300)

  // @ on a line written before: the task is made from the note.
  await endOf(lineOf(alpha.id)); await h.keyboard.type(' for @garden', { delay: 30 }); await wait(1000)
  const rows = await h.evaluate(() => [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu-title')].map((one) => one.textContent))
  check('@ on a line opens the note menu', rows.some((one) => one.includes('Garden plans')), rows.join(' | '))
  await h.keyboard.press('Enter'); await wait(300)
  await h.keyboard.press('Enter'); await wait(1200)
  a = await v('task', alpha.id)
  check('picked and Enter: the task is made from the note', a?.captureId === noteId, JSON.stringify({ captureId: a?.captureId, noteId, title: a?.title }))
  check('its line shows the note under it', (await h.locator(`[data-day-line="${alpha.id}"] [data-from-note]`).count()) === 1)
  const undo = h.locator('button', { hasText: 'Undo' }).last()
  if (await undo.count()) { await undo.click(); await wait(900) }
  a = await v('task', alpha.id)
  check('Undo takes the link back off', !a?.captureId, JSON.stringify({ captureId: a?.captureId }))

  // @ typed in the middle of a long line written before (as the Journal's Today has it).
  for (const title of ['Copy, paste, pray', 'raycast notes']) await h.evaluate((t) => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: t }] }] } }), title)
  const long = 'remind rory to take a look at the sagreetings data and bishop implications of using pr as category'
  await h.locator('[data-new="now"] .ProseMirror').click()
  await h.keyboard.insertText(long); await h.keyboard.press('Enter'); await wait(900)
  await h.keyboard.press('Escape'); await wait(200)
  const rory = await find(long)
  const roryText = () => h.evaluate((id) => document.querySelector(`[data-day-line="${id}"] .ProseMirror`)?.textContent, rory.id)
  await lineOf(rory.id).click(); await wait(200)
  // The caret after "the", where it was typed.
  await h.evaluate((id) => {
    const text = document.createTreeWalker(document.querySelector(`[data-day-line="${id}"] .ProseMirror`), NodeFilter.SHOW_TEXT).nextNode()
    getSelection().setBaseAndExtent(text, 33, text, 33)
  }, rory.id); await wait(200)
  await h.keyboard.type(' @ray', { delay: 40 }); await wait(1000)
  const asked = await h.evaluate((id) => {
    const line = document.querySelector(`[data-day-line="${id}"]`)
    const words = line.querySelector('.ProseMirror').getBoundingClientRect()
    const tools = line.querySelector('[aria-label="Tomorrow instead"]')?.parentElement.getBoundingClientRect()
    return {
      chip: line.querySelector('.ProseMirror .tiptap-slash-token')?.textContent,
      rows: [...document.querySelectorAll('.tiptap-suggestion-popup .tiptap-slash-menu-title')].map((one) => one.textContent),
      clear: !!tools && words.right <= tools.left
    }
  }, rory.id)
  check('@ mid-line: the @ and what is typed are lit as one chip, ending at the caret', asked.chip === '@ray', asked.chip)
  check('the menu puts a name starting with the words before one with them mid-word', asked.rows.indexOf('raycast notes') >= 0 && asked.rows.indexOf('raycast notes') < asked.rows.indexOf('Copy, paste, pray'), asked.rows.join(' | '))
  check('the line being written keeps clear of its own tools', asked.clear)
  await h.keyboard.press('Escape'); await wait(300)
  check('Escape closes the menu only: the caret stays in the line, the words as typed', (await h.locator('.tiptap-suggestion-popup').count()) === 0 && await focusIn(`[data-day-line="${rory.id}"]`) && (await roryText()) === long.replace('the sag', 'the @ray sag'))
  for (let i = 0; i < 4; i++) await h.keyboard.press('Backspace')
  await h.keyboard.type('@rayc', { delay: 40 }); await wait(1000)
  await h.keyboard.press('Enter'); await wait(400)
  check('picked: only the @ word gives way to the link, one space after it, the rest kept', (await roryText()) === long.replace('the sag', `the ${await h.locator(`[data-day-line="${rory.id}"] .tiptap-note-link-key`).textContent()}raycast notes sag`), await roryText())
  await h.keyboard.press('Meta+z'); await wait(300)
  check('⌘Z after picking: the typed @ word is back', (await roryText()) === long.replace('the sag', 'the @rayc sag'), await roryText())
  await h.keyboard.press('Meta+Shift+z'); await wait(300)
  await h.keyboard.type('X'); await wait(200)
  check('the caret is after the link and its space', (await roryText()).includes('raycast notes Xsagreetings'), await roryText())
  await h.keyboard.press('Backspace'); await h.keyboard.press('Escape'); await wait(1200)
  const roried = await v('task', rory.id)
  check('left: the task is saved with the name in its words, linked to the note', roried?.title === long.replace('the sag', 'the raycast notes sag') && !!roried?.captureId, JSON.stringify({ title: roried?.title, captureId: roried?.captureId }))
  check('drawn again, the line shows the name and the note under it', (await h.locator(`[data-day-line="${rory.id}"] [data-line]`).first().innerText()).includes('the raycast notes sagreetings') && (await h.locator(`[data-day-line="${rory.id}"] [data-from-note]`).count()) === 1)

  // !!! typed into a line: its priority, the words kept clean.
  await endOf(lineOf(beta2.id)); await h.keyboard.type(' !!!', { delay: 20 }); await h.keyboard.press('Enter'); await wait(1200)
  const b = await v('task', beta2.id)
  check('"!!!" sets its priority and leaves the words', b?.priority > 0 && b?.title === 'Qa beta', JSON.stringify({ priority: b?.priority, title: b?.title }))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
