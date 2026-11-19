// Quick capture beside the main window, outcome by outcome (the user, 15 Nov 2026: "why are there two sounds that run
// when i quick capture 'test 3' ... if so why doesnt the capture say so?", and then: "i dont want you adding features or
// in this case a variant of something pre-exisitng and then marking it complete yet it is not to parity with the
// version it is a variant of"). For each send: what the box says before it (its "This will" line, its "Similar to"
// chip), every sound either window asks for after the send (sound.ts keeps each cue by name on window.haligtreeCued,
// played or not), and the notice the main window shows, with its Undo. Beside it, the main window's own way: "Make it a
// task" on the same note, its words and its one sound.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/box-parity.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1100, height: 760 })
const { page, h, v, send, both } = c
// The box's line, light and dark, to read by eye beside each other (QA_SHOTS).
const shot = (name) => (process.env.QA_SHOTS ? both(join(process.env.QA_SHOTS, `box-parity-${name}`), page) : undefined)
const EDITOR = '.tiptap.ProseMirror.haligtree-editor:not(.is-line):not(.is-plain)'
const JOINED = 'Already on your list, so this was linked to that task instead of adding it twice'
const clear = (win) => win.evaluate(() => void (window.haligtreeCued && (window.haligtreeCued.length = 0)))
const cues = (win) => win.evaluate(() => [...(window.haligtreeCued ?? [])])
const shown = (words) => h.waitForFunction((w) => [...document.querySelectorAll('[role="status"]')].some((one) => one.textContent?.includes(w)), words, { timeout: 8000 }).then(() => true, () => false)
const openNamed = (name) => v('tasks').then((list) => list.filter((one) => one.status === 'open' && one.title.trim().toLowerCase() === name).length)
const capture = (name) => h.evaluate((n) => window.api.captures.list().then((all) => all.filter((one) => (one.label ?? '').trim().toLowerCase() === n).map((one) => one.status)), name)

/** The box opened and the words typed: what it says before the send, once it has read them. */
async function typed(words) {
  await h.evaluate(() => window.api.showPrompt())
  await page.waitForSelector(EDITOR, { state: 'visible' })
  await page.click(EDITOR)
  await page.keyboard.type(words, { delay: 30 })
  // Read after a pause in the typing; whether a task of that name is open comes from main after that.
  await page.waitForTimeout(1200)
  return page.evaluate(() => ({
    will: document.querySelector('[data-will-do]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    like: [...document.querySelectorAll('button')].map((one) => one.textContent?.trim() ?? '').find((w) => /^Similar to/.test(w)) ?? ''
  }))
}
/** ⌘↵ (⌥⌘↵ keeps the box for the next one): the sounds each window asked for, once the main window has said `words`. */
async function sent(words, more = false) {
  await clear(page)
  await clear(h)
  await page.keyboard.press(more ? 'Alt+Meta+Enter' : 'Meta+Enter')
  const said = words ? await (more ? page.waitForFunction((w) => document.body.innerText.includes(w), words, { timeout: 8000 }).then(() => true, () => false) : shown(words)) : true
  await page.waitForTimeout(600)
  return { said, box: await cues(page), home: await cues(h) }
}
// A milestone the send reached ("7 days in a row", celebrate.tsx) is a moment of its own, with its card and its cheer:
// logged, not counted as the send's.
const own = (got) => [...got.box, ...got.home].filter((cue) => cue !== 'cheer')
const one = (got, cue) => own(got).length === 1 && own(got)[0] === cue

try {
  await v('settings:set', { sounds: true, hintRate: 0 })

  // 1. The user's case: "test 3" is a task on your list already.
  await v('task:add', 'test 3')
  const before = await typed('test 3')
  console.log(`(before the send, the box says: “${before.will}”${before.like ? `, and “${before.like}”` : ''})`)
  check('a task already on your list: the box says it will join it, before the send', before.will.includes('Join your task “test 3”, already on your list'), before.will)
  await shot('join')
  const joined = await sent(JOINED)
  console.log(`(after ⌘↵: the box asked for ${joined.box.join(', ') || 'nothing'}; the main window for ${joined.home.join(', ') || 'nothing'})`)
  check('one sound for the send, and no other', one(joined, 'send'), JSON.stringify(joined))
  check('the main window says what became of it, in the main window’s own words', joined.said, (await h.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((one) => one.textContent).join(' | '))))
  check('and it is not made twice', (await openNamed('test 3')) === 1, String(await openNamed('test 3')))
  // Its Undo, in the main window: the note back in the Inbox, the task as it was.
  await h.getByRole('button', { name: /^Undo/ }).first().click()
  await h.waitForFunction(() => window.api.captures.list().then((all) => all.some((one) => (one.label ?? '').trim() === 'test 3' && one.status === 'open')), null, { timeout: 5000 }).catch(() => {})
  check('Undo there puts the note back in the Inbox and leaves the task', JSON.stringify(await capture('test 3')) === '["open"]' && (await openNamed('test 3')) === 1, JSON.stringify(await capture('test 3')))

  // 2. The main window's own way, on that note: "Make it a task", the same words, one sound.
  const id = await h.evaluate(() => window.api.captures.list().then((all) => all.find((one) => (one.label ?? '').trim() === 'test 3' && one.status === 'open')?.id))
  await send('capture', id)
  await h.waitForTimeout(1200)
  if (!(await h.getByText('Make it a task', { exact: true }).count())) await h.getByText('Details', { exact: true }).first().click()
  await h.waitForTimeout(500)
  await clear(h)
  await h.getByText('Make it a task', { exact: true }).first().click()
  const main = { said: await shown(JOINED), box: [], home: (await page.waitForTimeout(600), await cues(h)) }
  console.log(`(the main window's "Make it a task": ${main.said ? `“${JOINED}”` : 'other words'}, sounds ${main.home.join(', ') || 'none'})`)
  check('the main window’s own way says the same words', main.said)
  check('with one sound of its own', one(main, 'nope'), JSON.stringify(main.home))
  await h.keyboard.press('Escape')

  // 3. A new task: said as one, one sound, and the main window says it with Open.
  const fresh = await typed('call the plumber')
  check('a new task: the box says it will add it', fresh.will.includes('Add to your tasks'), fresh.will)
  await shot('add')
  const made = await sent('Added to your tasks')
  check('one sound for it', one(made, 'send'), JSON.stringify(made))
  check('the main window says it, with Open', made.said && (await h.locator('[role="status"]').getByRole('button', { name: /^Open/ }).count()) > 0)

  // 4. ⌥⌘↵, the box kept for the next one: it says it there itself, still with one sound.
  await typed('pay the rent')
  const more = await sent('Added to your tasks', true)
  check('kept open for the next one: the box says it, with one sound', more.said && one(more, 'send'), JSON.stringify(more))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // 5. A short note kept before: "Similar to" says so, as it does for a long one.
  await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'fig jam' }] }] } }))
  const again = await typed('fig jam')
  console.log(`(a short note kept before: “${again.like || 'no chip'}”)`)
  check('a short note kept before: the box says it is like that one', again.like.includes('Similar to “fig jam”'), again.like)
  const note = await sent('')
  check('one sound for a note', one(note, 'send'), JSON.stringify(note))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
