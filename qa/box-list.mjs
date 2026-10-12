// A day written into quick capture as a list, kind Todo: under the box,
// "This will" says how many tasks and steps Create makes, never one task;
// no "Similar to" for the first line alone. Create makes a task a line, the
// indented lines steps of the task above, a #tag on its own line's task, a
// line named like an open task joining it. ⌘Z takes every one back and puts
// the box back as it was. The × keeps it one note. A pasted list in a Note
// offers the same and makes the box a Todo. A page of mixed lines offers
// "Sort this out" instead, never both.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/box-list.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { page, electron, v } = c
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
await v('settings:set', { hintRate: 0, rotCount: 0, motion: false })
const will = () => page.evaluate(() => document.querySelector('[data-will-do]')?.innerText.replace(/\s+/g, ' ').trim() ?? '')
const similar = () => page.evaluate(() => /Similar to/.test(document.body.innerText))
const open = async () => (await v('tasks')).filter((one) => one.status === 'open')
const named = async (title) => (await open()).find((one) => one.title === title)
const words = () => page.evaluate(() => document.querySelector('.tiptap.ProseMirror.mindflow-editor')?.innerText.trim() ?? '')
const fresh = async () => {
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(700)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.waitForTimeout(200)
}
// Bullets as a hand writes them: "- " starts the list, Tab steps in, ⇧Tab steps out.
const writeList = async () => {
  const type = (text) => page.keyboard.type(text, { delay: 8 })
  await type('- buy milk and eggs #errands '); await page.keyboard.press('Enter')
  await type('read chapter 3'); await page.keyboard.press('Enter')
  await type('essay:'); await page.keyboard.press('Enter'); await page.keyboard.press('Tab')
  await type('outline'); await page.keyboard.press('Enter')
  await type('draft'); await page.keyboard.press('Enter'); await page.keyboard.press('Shift+Tab')
  await type('call the bank')
  await page.waitForTimeout(900)
}

try {
  // Something the first line alone would have matched, and a task one line repeats.
  await page.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'buy milk and eggs #errands' }] }] } }))
  await v('task:add', 'call the bank')
  const before = (await open()).length

  await fresh()
  await page.keyboard.press('Meta+2')
  await page.waitForTimeout(300)
  await writeList()
  const said = await will()
  check('"This will" counts the tasks and steps', /Make 4 tasks, 2 steps/.test(said), said)
  check('it never says one task', !/Add to your tasks/.test(said), said)
  check('no "Similar to" for the first line alone', !(await similar()))

  await page.keyboard.press('Meta+Enter')
  await page.waitForFunction(() => /Made 4 tasks/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {})
  const toast = await page.evaluate(() => (/Made [^\n]+/.exec(document.body.innerText) ?? [''])[0])
  check('one notice for the lot, saying one joined a task you had', /Made 4 tasks, 2 steps\. 1 was already on your list/.test(toast), toast)
  await page.waitForTimeout(600)
  const essay = await named('essay')
  check('each top line a task', !!(await named('buy milk and eggs #errands')) && !!(await named('read chapter 3')) && !!essay)
  check('the indented lines are steps of the line above, named without its colon', JSON.stringify(essay?.subtasks?.map((one) => one.text)) === '["outline","draft"]', JSON.stringify(essay?.subtasks))
  check('no task made of a step', !(await named('outline')) && !(await named('draft')))
  const tagged = (await v('tasks')).filter((one) => /#errands/.test(one.title ?? '')).map((one) => one.title)
  check('the #tag is on its own line’s task only', tagged.length === 1 && tagged[0] === 'buy milk and eggs #errands', JSON.stringify(tagged))
  check('the line named like a task you had joined it, not twice', (await open()).filter((one) => one.title === 'call the bank').length === 1)
  check('three tasks more than before', (await open()).length === before + 3, `${before} → ${(await open()).length}`)

  await page.keyboard.press('Meta+z')
  await page.waitForTimeout(1400)
  check('⌘Z takes back every task made', !(await named('essay')) && !(await named('read chapter 3')) && !(await named('buy milk and eggs #errands')))
  check('and leaves the task you had', !!(await named('call the bank')))
  check('the box is back with the list', /essay:/.test(await words()) && /call the bank/.test(await words()), JSON.stringify(await words()))

  // The × keeps it all one note.
  await fresh()
  await page.keyboard.press('Meta+2')
  await writeList()
  await page.locator('[data-will-do] [data-will-off]').first().click()
  await page.waitForTimeout(500)
  check('the × takes the list line away', !/Make 4 tasks/.test(await will()), await will())
  await page.keyboard.press('Meta+Enter')
  await page.waitForTimeout(1500)
  const kept = (await page.evaluate(() => window.api.captures.list())).filter((one) => (one.label ?? '').startsWith('buy milk and eggs'))
  check('kept as one note', kept.length === 2 && !(await named('essay')), `${kept.length} captures`)

  // A list pasted into a Note offers the tasks; taken up, the box is a Todo.
  await fresh()
  await page.keyboard.press('Meta+1')
  await electron.evaluate(({ clipboard }) => clipboard.writeText('- water the plants\n- read chapter 4\n- essay two:\n  - outline\n  - draft'))
  await page.keyboard.press('Meta+v')
  await page.waitForTimeout(900)
  const offer = await page.evaluate(() => (/A list of [^\n]+\n[^\n]+/.exec(document.body.innerText) ?? [''])[0])
  check('a pasted list in a Note is offered as tasks', /Make 3 tasks, 2 steps/.test(offer), offer)
  await page.getByRole('button', { name: /Make 3 tasks/ }).first().click()
  await page.waitForTimeout(700)
  check('taken up, the box says what Create makes', /Make 3 tasks, 2 steps/.test(await will()), await will())
  check('and is a Todo', await page.evaluate(() => /Todo/.test(document.querySelector('main[data-chrome]')?.innerText ?? '')))
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')

  // A page of mixed lines: "Sort this out", not tasks a line.
  await fresh()
  await page.keyboard.press('Meta+2')
  for (const line of ['buy stamps', 'https://example.com/how-tides-work', '“Slow is smooth, smooth is fast.” - a coach', 'read chapter 5', 'serendipity: luck in finding good things', 'call the vet'])
    (await page.keyboard.type(line, { delay: 5 }), await page.keyboard.press('Enter'))
  await page.waitForTimeout(1200)
  const mixed = await will()
  check('a mixed page offers “Sort this out”', /Sort this out/.test(mixed), mixed)
  check('and not tasks a line as well', !/Make \d+ tasks/.test(mixed), mixed)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')
  await page.keyboard.press('Escape')
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
