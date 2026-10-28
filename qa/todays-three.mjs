// Today's three: the first three lines of Now are numbered 1 2 3; a drag before any is ticked changes them; once
// one is ticked they are kept for the day, stay at the top struck through, and the header says "Your three: 1 of 3 done"
// while the rest moves up unnumbered. "Clear ticked" still clears, and the count still counts the cleared one.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-p/main/index.js HALIGTREE_QA_AWAY=1 node qa/todays-three.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1100, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const shots = process.env.QA_SHOTS ?? process.env.QA_DATA
try {
  // Nothing of the sandbox's own on today: the page holds only the lines written here.
  const tonight = new Date(new Date().setHours(24, 0, 0, 0))
  const later = new Date(Date.now() + 3 * 864e5).toISOString()
  for (const task of await v('tasks')) {
    if (task.status !== 'open') continue
    if (task.dueAt && new Date(task.dueAt) < tonight) await v('task:save', task.id, { due: later })
    if (task.deadline && new Date(task.deadline) < tonight) await v('task:save', task.id, { deadline: later })
  }
  const today = new Date().toDateString()
  const doneToday = (await v('tasks')).filter((task) => task.status === 'done' && task.completedAt && new Date(task.completedAt).toDateString() === today).map((task) => task.id)
  await h.evaluate((ids) => {
    localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' }))
    const d = new Date()
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    localStorage.setItem(`day-list:cleared:${day}`, JSON.stringify(ids))
    localStorage.removeItem(`day-list:three:${day}`)
  }, doneToday)
  await h.reload(); await wait(1500); await go('today'); await wait(2500)
  for (const line of ['Write the report', 'Call the bank', 'Fix the gate latch', 'Read chapter 4', 'Water the plants']) {
    await h.keyboard.type(line, { delay: 8 }); await h.keyboard.press('Enter'); await wait(450)
  }
  await h.keyboard.press('Escape'); await wait(400)
  const ranks = () => h.evaluate(() => [...document.querySelectorAll('[data-day-line][data-section=now]')].map((row) => `${row.dataset.rank ?? '-'}:${row.querySelector('textarea,button[role=checkbox]')?.getAttribute('aria-label')}`))
  const mark = () => h.evaluate(() => { const one = document.querySelector('[data-three="1"]'); const look = getComputedStyle(one); return { color: look.color, size: parseFloat(look.fontSize), weight: Number(look.fontWeight), shown: Number(look.opacity) } })
  let r = await ranks()
  check('the first three lines are numbered 1 2 3, the rest not', r.slice(0, 3).join() === '1:Write the report,2:Call the bank,3:Fix the gate latch' && r.slice(3).every((one) => one.startsWith('-')), r.join(' | '))
  const m = await mark()
  check('the number reads in the page\'s own colour, not small grey', m.weight >= 600 && m.size >= 12 && m.shown === 1, JSON.stringify(m))
  // Read as drawn, the spaces left out: the rolling words are a box a letter, spaced apart in what is read back.
  const head = () => h.evaluate(() => Object.fromEntries([['three', '[data-three-count]'], ['all', '[data-now-count]']].map(([key, at]) => [key, document.querySelector(at)?.innerText.replace(/\s+/g, '') ?? ''])))
  const said = (text) => text.replace(/\s+/g, '')
  check('the header says it before any is ticked', (await head()).three === said('Your three: 0 of 3 done'), JSON.stringify(await head()))
  await h.screenshot({ path: `${shots}/todays-three-morning.png` })

  // Before any is ticked, a line moved up into the first three changes them (⌥↑ is the drag's own key).
  const id = async (t) => (await v('tasks')).find((one) => one.title === t)?.id
  await h.locator(`[data-day-line="${await id('Read chapter 4')}"] [data-line] .ProseMirror`).first().click(); await wait(200)
  await h.keyboard.press('Alt+ArrowUp'); await wait(600)
  await h.keyboard.press('Escape'); await wait(400)
  r = await ranks()
  check('a line moved into the first three, before any is ticked, is one of the three', r.slice(0, 3).join() === '1:Write the report,2:Call the bank,3:Read chapter 4' && r[3] === '-:Fix the gate latch', r.join(' | '))

  // The first of the three ticked: they are kept, struck through in place, the rest moving up under them.
  await h.locator(`[data-day-line="${await id('Write the report')}"] [role=checkbox]`).first().click(); await wait(1200)
  r = await ranks()
  const kept = await h.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('day-list:three:')).map(([, ids]) => JSON.parse(ids).length))
  check('ticked, the first stays numbered at the top, struck through', r[0] === '1:Write the report' && await h.evaluate(() => !!document.querySelector('[data-rank="1"][data-done]')), r.join(' | '))
  check('the three are kept for the day once one is ticked', kept.join() === '3', JSON.stringify(kept))
  check('the header says "Your three: 1 of 3 done"', (await head()).three === said('Your three: 1 of 3 done'), JSON.stringify(await head()))
  const above = await h.evaluate(() => { const rows = [...document.querySelectorAll('[data-day-line][data-section=now]')]; const cut = document.querySelector('[data-top-three]'); return rows.filter((row) => cut && row.compareDocumentPosition(cut) & Node.DOCUMENT_POSITION_FOLLOWING).map((row) => `${row.dataset.rank ?? '-'}${row.dataset.top ? '*' : ''}`) })
  check('a line from the rest moved up into Now, bold and unnumbered', above.join() === '1,2*,3*,-*', above.join())

  // After the three are kept, moving a rest line up past them no longer changes them.
  await h.locator(`[data-day-line="${await id('Fix the gate latch')}"] [data-line] .ProseMirror`).first().click(); await wait(200)
  await h.keyboard.press('Alt+ArrowUp'); await wait(600)
  await h.keyboard.press('Escape'); await wait(400)
  r = await ranks()
  check('once kept, a line moved up does not take a place among the three', r.slice(0, 3).map((one) => one.split(':')[0]).join() === '1,2,3' && r.slice(0, 3).every((one) => !one.includes('Fix the gate')), r.join(' | '))

  // Ticked from anywhere (here, through the app), the same: struck, still numbered.
  await v('task:done', await id('Call the bank')); await wait(1200)
  check('a second ticked elsewhere: "Your three: 2 of 3 done"', (await head()).three === said('Your three: 2 of 3 done'), JSON.stringify(await head()))
  await h.screenshot({ path: `${shots}/todays-three-ticked.png` })

  // "Clear ticked": the struck lines go, and the count still counts them.
  await h.getByRole('button', { name: 'Clear ticked' }).click(); await wait(900)
  r = await ranks()
  check('"Clear ticked" clears the ticked lines', !r.some((one) => one.includes('Write the report') || one.includes('Call the bank')), r.join(' | '))
  check('the count still counts the cleared ones', (await head()).three === said('Your three: 2 of 3 done'), JSON.stringify(await head()))
  check('the one left of the three keeps its number', r[0] === '3:Read chapter 4', r.join(' | '))

  // Quick capture's Today marks the same three: the one still open, numbered as on the page.
  const box = c.page
  await box.evaluate(() => window.api.showPrompt()); await box.waitForTimeout(800)
  await box.evaluate(() => document.activeElement?.blur?.()); await box.keyboard.press('Control+2'); await box.waitForTimeout(1200)
  const marks = await box.evaluate(() => [...document.querySelectorAll('[data-three]')].map((one) => `${one.dataset.three}:${one.closest('.group')?.querySelector('[data-task-title]')?.textContent}`))
  check('quick capture\'s Today numbers the day\'s three still open', marks.join() === '3:Read chapter 4', marks.join(' | '))
  await box.screenshot({ path: `${shots}/todays-three-box.png` })
  await box.keyboard.press('Escape')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
