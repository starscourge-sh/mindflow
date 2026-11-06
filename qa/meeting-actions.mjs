// A meeting's action items: a real checklist on its page. Each has its words, who owns it (the one who committed, or
// the one asked), the day if one was said, and its moment; ticked here it is ticked, and its task too and back; made a
// task in one click with owner and day; its words fixed by a double-click; taken off with "Not an action". Every Mac
// finds only lines that commit or ask, never a sung line; HALIGTREE_QA_CAPS=ai checks Apple Intelligence's (a
// stand-in) written properly. Open items show on Today and on the week.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [HALIGTREE_QA_CAPS=ai] node qa/meeting-actions.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { recorded } from './meeting-flow.mjs'
import { MEETING } from './meeting-lib.mjs'

const AI = process.env.HALIGTREE_QA_CAPS === 'ai'
const FRAMES = process.env.FRAMES
const { check, done } = checks()
// The stand-up, with a line sung in it (music in the background of the call).
const lines = [...MEETING, { who: 'marco', text: "You'll handle my heart while I take you in.", start: 21.2, end: 23.6 }]
const { c, record } = await recorded({ lines })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const items = () => h.evaluate(() => [...document.querySelectorAll('[data-meeting-item]')].map((el) => ({ id: el.dataset.meetingItem, text: el.querySelector('[data-meeting-item-text]')?.textContent, owner: el.querySelector('[data-meeting-owner]')?.textContent, due: el.querySelector('[data-meeting-due]')?.textContent ?? null, done: el.hasAttribute('data-done'), task: !!el.querySelector('[data-meeting-item-task]') })))
try {
  const id = await record()
  await wait(800)
  const by = await h.evaluate(() => document.querySelector('[data-meeting-actions]')?.dataset.meetingActions)
  check(AI ? 'with Apple Intelligence (a stand-in): the items are said to be its' : 'every other Mac: the items are said to be lines found', by === (AI ? 'stand-in' : 'found'), by)
  const list = await items()
  check('the lines that commit or ask, written down plainly', JSON.stringify(list.map((one) => one.text)) === JSON.stringify(['send them by Friday', 'share the research notes', 'add them to the folder today', 'take it and write up what they say', 'ship the beta next week']), list.map((one) => one.text).join(' | '))
  check('never the sung line', !list.some((one) => /heart/.test(one.text)))
  const voiceOf = (text) => list.find((one) => one.text === text)?.owner
  check('who owns each: the one who promised, or the one asked', voiceOf('send them by Friday') === voiceOf('add them to the folder today') && voiceOf('share the research notes') === voiceOf('send them by Friday') && voiceOf('take it and write up what they say') === 'You', JSON.stringify(list.map((one) => [one.text, one.owner])))
  check('the day said, as a date', /Fri/.test(list[0].due ?? ''), list[0].due)
  if (FRAMES) await c.both(join(FRAMES, `actions-${AI ? 'ai' : 'every'}`))

  // Ticked here: done, with its sound; again: open.
  await h.locator('[data-meeting-tick]').nth(1).click(); await wait(300)
  check('ticked on the page it is done', (await items())[1].done)
  await h.locator('[data-meeting-tick]').nth(1).click(); await wait(300)
  check('and open again', !(await items())[1].done)

  // Made a task in one click, with its owner and its day; ticked in Tasks, ticked here; and back.
  await h.locator('[data-meeting-item]').first().hover()
  await h.locator('[data-meeting-item]').first().locator('[data-meeting-task]').click(); await wait(900)
  const task = (await v('tasks')).find((one) => /send them/.test(one.title))
  // "by Friday" is read the way any task reads it: a deadline of Friday.
  const day = task && (task.dueAt || task.deadline)
  check('made a task with its owner and day', !!task && task.title.startsWith(`${list[0].owner}: `) && !!day && new Date(day).getDay() === 5, JSON.stringify(task && { title: task.title, due: task.dueAt, deadline: task.deadline }))
  check('the item says it is in Tasks, and offers no second task', (await items())[0].task && !(await h.$('[data-meeting-item]:first-child [data-meeting-task]')))
  await v('task:done', task.id); await wait(1200)
  check('ticked in Tasks, it is ticked here', (await items())[0].done)
  await h.locator('[data-meeting-tick]').first().click(); await wait(1200)
  check('unticked here, the task is open again', (await v('tasks')).find((one) => one.id === task.id)?.status === 'open')

  // The words fixed by a double-click; one taken off with "Not an action".
  await h.locator('[data-meeting-item-text]').nth(2).dblclick()
  await h.waitForSelector('[data-meeting-item-edit]')
  await h.keyboard.press('Meta+a'); await h.keyboard.type('add the notes to the shared folder today'); await h.keyboard.press('Enter'); await wait(300)
  check('an item\'s words fixed in place', (await items())[2].text === 'add the notes to the shared folder today')
  await h.locator('[data-meeting-item]').nth(4).hover()
  await h.locator('[data-meeting-item]').nth(4).locator('[data-meeting-not]').click(); await wait(400)
  check('"Not an action" takes it off', (await items()).length === 4 && !(await items()).some((one) => /ship the beta/.test(one.text)))

  // Open items on Today and on the week.
  await c.go('day'); await wait(1500)
  const today = await h.evaluate(() => [...document.querySelectorAll('[data-meeting-open-item]')].map((el) => el.textContent))
  if (FRAMES) await h.screenshot({ path: join(FRAMES, `today-${AI ? 'ai' : 'every'}.png`) })
  check('Today shows the meeting\'s open items (not the one now a task)', today.length === 3 && today.some((one) => /share the research notes/.test(one)) && !today.some((one) => /send them by Friday/.test(one)), today.join(' | '))
  await h.locator('[data-meeting-open-item]').first().click(); await wait(1500)
  check('one clicked opens its meeting', await h.evaluate((one) => document.querySelector('[data-meeting-page]')?.closest('[data-open]')?.dataset.open === one, id))
  await c.go('weekpage'); await wait(1500)
  const week = await h.evaluate(() => document.querySelectorAll('[data-meeting-open-item]').length)
  check('and the week shows them too', week === 3, week)
  check('no errors on the page', !c.errors.length, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.stack.split('\n').slice(0, 3).join(' / '))
} finally {
  await c.close()
  done()
}
