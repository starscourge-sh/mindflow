// A day written into quick capture as a list, kind Task: under the box,
// "This will" says how many tasks and steps Create makes, never one task;
// no "Similar to" for the first line alone. Create makes a task a line, the
// indented lines steps of the task above, a #tag on its own line's task, a
// line named like an open task joining it. ⌘Z takes every one back and puts
// the box back as it was. The × keeps it one note. A pasted list in a Note
// offers the same and makes the box a Task. A page of mixed lines offers
// "Sort this out" instead, never both.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js MINDFLOW_QA_AWAY=1 node qa/box-list.mjs
import { sandbox } from './sandbox-lib.mjs'

const c = await sandbox({ width: 1100, height: 760 })
const { page, electron, v, h, send } = c
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
  // The box goes as it sends and keeps no notice: the main window says it.
  await h.waitForFunction(() => /Made 4 tasks/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {})
  const toast = await h.evaluate(() => (/Made [^\n]+/.exec(document.body.innerText) ?? [''])[0])
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

  // A list pasted into a Note offers the tasks; taken up, the box is a Task.
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
  // The kind is called Task since a32f2c4e; it leads the box's footer.
  check('and is a Task', await page.evaluate(() => (document.querySelector('main[data-chrome]')?.innerText ?? '').split('\n')[0].trim() === 'Task'))
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
  check('"This will" says what Create does with it, never one task', /Keep the page, then pick what each line becomes/.test(mixed) && !/Add to your tasks/.test(mixed), mixed)
  // Create: the page kept as a note, opened in "Sort this out"; no task made of it.
  const openBefore = (await open()).length
  await page.keyboard.press('Meta+Enter')
  await h.waitForSelector('[data-sort-out]', { timeout: 6000 }).catch(() => {})
  check('Create opens “Sort this out” with the page', (await h.locator('[data-sort-row]').count()) >= 5, `${await h.locator('[data-sort-row]').count()} rows`)
  check('and makes no task of it', (await open()).length === openBefore && !(await named('buy stamps')), `${openBefore} → ${(await open()).length}`)
  const pageNote = (await h.evaluate(() => window.api.captures.list())).find((one) => (one.label ?? '').startsWith('buy stamps'))
  check('the page is kept as a note in the inbox', pageNote?.kind === 'note' && pageNote?.status === 'open', JSON.stringify({ kind: pageNote?.kind, status: pageNote?.status }))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(500)

  // "Make it a task" on notes already kept: a list makes a task a line, one notice, one Undo.
  const body = (...blocks) => ({ type: 'doc', content: blocks })
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const bullets = (...items) => ({ type: 'bulletList', content: items.map((one) => ({ type: 'listItem', content: Array.isArray(one) ? [para(one[0]), bullets(...one.slice(1))] : [para(one)] })) })
  const listNote = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), body(bullets('book the ferry', ['pack the tent', 'pegs', 'groundsheet'], 'charge the lamp')))
  const headed = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), body(para('trip prep:'), bullets('book the ferry', 'charge the lamp')))
  const plainNote = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), body(para('Fix the squeaky gate'), para('It squeaks most on cold mornings, try oil first.')))
  const mixedNote = await h.evaluate((b) => window.api.captures.create({ kind: 'todo', body: b }), body(...['wash the car', 'https://example.com/garden-ideas', '“Well begun is half done.” - an old saying', 'post the parcel', 'water the herbs', 'return the drill'].map(para)))
  // The note open, its details shown, and its own "Make it a task" picked.
  const makeIt = async (id) => {
    await send('capture', id)
    await h.waitForTimeout(1200)
    if (!(await h.getByText('Make it a task', { exact: true }).count())) await h.getByText('Details', { exact: true }).first().click()
    await h.waitForTimeout(500)
    await h.getByText('Make it a task', { exact: true }).first().click()
  }
  await makeIt(listNote)
  await h.waitForFunction(() => /Made 3 tasks, 2 steps/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {})
  const madeSaid = await h.evaluate(() => (/Made [^\n]+/.exec(document.body.innerText) ?? [''])[0])
  check('“Make it a task” on a list note says the count', /Made 3 tasks, 2 steps/.test(madeSaid), madeSaid)
  const tent = await named('pack the tent')
  check('a task a line, the indented lines its steps', !!(await named('book the ferry')) && !!(await named('charge the lamp')) && JSON.stringify(tent?.subtasks?.map((one) => one.text)) === '["pegs","groundsheet"]', JSON.stringify(tent?.subtasks))
  check('the note leaves the inbox', (await h.evaluate((id) => window.api.captures.list().then((all) => all.find((one) => one.id === id)?.status), listNote)) === 'resolved')
  await h.getByRole('button', { name: /^Undo/ }).first().click().catch(() => {})
  await h.waitForTimeout(900)
  check('one Undo takes back every task', !(await named('book the ferry')) && !(await named('pack the tent')) && !(await named('charge the lamp')))
  check('and puts the note back in the inbox', (await h.evaluate((id) => window.api.captures.list().then((all) => all.find((one) => one.id === id)?.status), listNote)) === 'open')
  // "trip prep:" over its lines: one task named without the colon, the lines its steps, as Today's page reads it.
  const prep = await v('toTask', headed)
  check('a line ending in a colon over a list is a task, the list its steps', prep?.said === 'a task with 2 steps' && JSON.stringify((await named('trip prep'))?.subtasks?.map((one) => one.text)) === '["book the ferry","charge the lamp"]', prep?.said)
  // A note of plain sentences is still one task, linked to it.
  const one = await v('toTask', plainNote)
  check('a note of plain sentences is one task, as before', !!one?.id && !one.also && !!(await named('Fix the squeaky gate')))
  // A mixed page: nothing made, it comes back to be sorted.
  const sorted = await v('toTask', mixedNote)
  check('a mixed page makes no task, and comes back to be sorted', typeof sorted?.mixed === 'string' && !(await named('wash the car')), JSON.stringify(sorted).slice(0, 80))
  await makeIt(mixedNote)
  await h.waitForSelector('[data-sort-out]', { timeout: 5000 }).catch(() => {})
  check('“Make it a task” on a mixed page opens “Sort this out”', (await h.locator('[data-sort-row]').count()) >= 5 && !(await named('wash the car')))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)
  await page.keyboard.press('Meta+a'); await page.keyboard.press('Backspace')

  // One frosted sheet: with the side panel open, nothing inside the box paints a near-solid band of its own.
  if (!(await page.locator('[aria-label="Hide the side panel"]').count())) await page.locator('[aria-label="Show the side panel"]').click()
  await page.waitForTimeout(1200)
  const slabs = await page.evaluate(() => [...document.querySelectorAll('.app-container *')].filter((el) => {
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor)
    if (!m) return false
    const alpha = m[1].split(/[ ,/]+/).filter(Boolean)[3]
    const r = el.getBoundingClientRect()
    return (alpha === undefined || Number(alpha) > 0.3) && r.width > 200 && r.height > 24 && !el.closest('[role=dialog],[role=menu],[data-radix-popper-content-wrapper],.tiptap-find-bar')
  }).map((el) => String(el.className).slice(0, 60)))
  check('no solid band inside the box or its side panel', !slabs.length, JSON.stringify(slabs))
  await page.keyboard.press('Escape')
  // A day's list written the way people do, tags first: Create says where every task went.
  await fresh()
  await page.keyboard.press('Meta+2')
  {
    const type = (text) => page.keyboard.type(text, { delay: 6 })
    await type('- #alpha go live at 13:00'); await page.keyboard.press('Enter')
    await type('#beta check the order tables:'); await page.keyboard.press('Enter'); await page.keyboard.press('Tab')
    await type('first table'); await page.keyboard.press('Enter')
    await type('second table'); await page.keyboard.press('Enter'); await page.keyboard.press('Shift+Tab')
    await type('#gamma, tidy the shared drive'); await page.keyboard.press('Enter')
    await type('#figure out how to split the bill'); await page.keyboard.press('Enter')
    await type('#beta plan the picnic')
    await page.waitForTimeout(900)
  }
  await page.keyboard.press('Meta+Enter')
  await h.waitForFunction(() => /Made 5 tasks/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {})
  const listSaid = await h.evaluate(() => (/Made 5 tasks[^\n]*/.exec(document.body.innerText) ?? [''])[0])
  check('the notice says how many, and that the ones with no date are in Upcoming under “No date”', /Made 5 tasks, 2 steps\. 4 with no date are in Upcoming, under “No date”/.test(listSaid), listSaid)
  await h.waitForFunction(() => /under “No date”/.test(document.body.innerText), null, { timeout: 5000 }).catch(() => {})
  check('the main window says it too, the box having gone', await h.evaluate(() => /Made 5 tasks, 2 steps\. 4 with no date/.test(document.body.innerText)))
  check('with “Show them”', (await h.getByRole('button', { name: /Show them/ }).count()) > 0)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/main-notice.png` })
  await h.getByRole('button', { name: /Show them/ }).first().click().catch(() => {})
  await h.waitForTimeout(1200)
  const upcoming = await h.evaluate(() => document.body.innerText)
  // The group is headed “No date” since d8bc7e41.
  const backlogAt = await h.evaluate(() => ([...document.querySelectorAll('h2, h3')].find((one) => /^No date/.test(one.textContent.trim()))?.getBoundingClientRect().top ?? -innerHeight) / innerHeight)
  check('“Show them” opens Upcoming at “No date”, with them in it', backlogAt >= 0 && backlogAt < 0.5 && /plan the picnic/.test(upcoming) && /split the bill/.test(upcoming), `“No date” heading at ${Math.round(backlogAt * 100)}% down`)
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/upcoming-after-list.png` })
  check('a leading #tag’s comma is dropped', !!(await named('#gamma tidy the shared drive')) && !(await open()).some((one) => /^\s*,|#gamma,/.test(one.title)), JSON.stringify((await open()).filter((one) => /tidy the shared/.test(one.title)).map((one) => one.title)))
  check('a #word that starts the sentence and is no tag in use stays in the title', !!(await named('figure out how to split the bill')), JSON.stringify((await open()).filter((one) => /split the bill/.test(one.title)).map((one) => one.title)))
  check('the steps under a line ending in a colon are kept', JSON.stringify((await named('#beta check the order tables'))?.subtasks?.map((one) => one.text)) === '["first table","second table"]', JSON.stringify((await named('#beta check the order tables'))?.subtasks))
  // The box's Tasks tab counts every open task, and “No date” sits by Upcoming with its count.
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(800)
  if (!(await page.locator('[aria-label="Hide the side panel"]').count())) await page.locator('[aria-label="Show the side panel"]').click()
  await page.keyboard.press('Control+2')
  await page.waitForTimeout(900)
  const tabSaid = await page.evaluate(() => document.querySelector('button[data-home="task"]')?.innerText.replace(/(\d)\s+(?=\d)/g, '$1').replace(/\s+/g, ' ').trim() ?? '')
  const openCount = (await open()).length
  check('the box’s Tasks tab counts every open task, dated or not', tabSaid === `Tasks ${openCount}`, `${tabSaid} vs ${openCount} open`)
  const chips = await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].map((one) => one.innerText.replace(/\s+/g, '')).filter((t) => /^(Today|Upcoming|Nodate|Routines)/.test(t)))
  const at = chips.findIndex((one) => /^Nodate\d+/.test(one))
  check('“No date” with its count sits next to Upcoming', at > 0 && /^Upcoming/.test(chips[at - 1]), JSON.stringify(chips))
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/box-tasks-after-list.png` })
  await page.keyboard.press('Escape')
  // The note open in the box's own editor, moved to the Bin from the side panel's Inbox: the box is a new capture again, and Undo brings the note back.
  const binMe = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A made-up note to put in the Bin' }] }] } }))
  await page.evaluate(() => window.api.showPrompt())
  await page.waitForTimeout(800)
  if (!(await page.locator('[aria-label="Hide the side panel"]').count())) await page.locator('[aria-label="Show the side panel"]').click()
  await page.keyboard.press('Control+1')
  await page.waitForTimeout(900)
  const row = page.locator('[data-id="' + binMe + '"]').first()
  const rowAt = (await row.count()) ? row : page.getByText('A made-up note to put in the Bin').last()
  await rowAt.click()
  await page.waitForTimeout(900)
  check('the note opens in the box’s editor', /A made-up note to put in the Bin/.test(await words()), JSON.stringify(await words()))
  await rowAt.click({ button: 'right' })
  await page.waitForTimeout(400)
  await page.getByRole('menuitem', { name: /Move to the Bin/ }).first().click().catch(() => {})
  await page.waitForTimeout(1000)
  const status = () => h.evaluate((id) => window.api.captures.list().then((all) => all.find((one) => one.id === id)?.status), binMe)
  check('binned from the Inbox beside it', (await status()) === 'discarded', await status())
  check('the box’s editor lets it go, a new capture again', !/A made-up note to put in the Bin/.test(await words()), JSON.stringify(await words()))
  await page.getByRole('button', { name: /^Undo/ }).first().click().catch(() => {})
  await page.waitForTimeout(900)
  check('Undo brings the note back', (await status()) === 'open', await status())
  await page.keyboard.press('Escape')
} catch (error) {
  check('the probe ran to its end', false, String(error?.message ?? error).split('\n')[0])
} finally {
  const passed = results.filter(Boolean).length
  console.log(`${passed}/${results.length} passed`)
  console.log(c.errors.length ? 'errors: ' + c.errors.slice(0, 3).join(' | ') : 'no page errors')
  await c.close()
  process.exit(passed === results.length ? 0 : 1)
}
