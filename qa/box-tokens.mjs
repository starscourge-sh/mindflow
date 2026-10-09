// The box's command words, lit as you type and each one able to be kept as
// plain text (Todoist's way). For every kind: the light appears; kept plain
// and sent, nothing happens (no timer, no date, no clue, no task); left lit
// and sent, it does. Read back through the app's own API, not the screen.
//
//   npx electron-vite build --outDir out-tokens
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-tokens/main/index.js MINDFLOW_QA_AWAY=1 node qa/box-tokens.mjs
//
// SHOTS=dir saves light and dark pictures of the box with tokens lit.
import { mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { open } from './harness.mjs'

// One data folder for the whole run, so a quit and relaunch comes back to the same box.
process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'vigil-tokens-'))

let qa = await open()
let { page } = qa
const errors = []
const listen = () => page.on('pageerror', (error) => errors.push(`PAGEERROR ${error.message}`))
listen()
// React's own warnings (a dev build): said, not failed on, as some are not this box's.
const warnings = []
page.on('console', (message) => ['error', 'warning'].includes(message.type()) && warnings.push(message.text().slice(0, 240)))
const results = []
const EDITOR = '.tiptap.ProseMirror.mindflow-editor:not(.is-line)'
const wait = (ms = 300) => page.waitForTimeout(ms)
const v = (channel, ...args) => page.evaluate(([c, a]) => window.api.vigil(c, ...a), [channel, args])
const captures = async () => (await page.evaluate(() => window.api.captures.list())) ?? []
// A save lands a moment after the send: asked again for a few seconds before it counts as missing.
const capture = async (words) => {
  for (let i = 0; i < 15; i++) {
    const found = (await captures()).find((one) => (one.label ?? '').includes(words))
    if (found) return found
    await wait(200)
  }
  return undefined
}
const tasks = () => v('tasks')
const task = async (words) => (await tasks()).find((one) => one.title.includes(words))
const lit = (kind) => page.locator(`${EDITOR} .box-token[data-box-token="${kind}"]`).count()
const willDo = () => page.evaluate(() => document.querySelector('[data-will-do]')?.textContent ?? '')

async function fresh() {
  await page.evaluate(() => window.api.showPrompt())
  await wait(200)
  await qa.reset()
  // A kind picked by hand in a case before is let go: the wording decides again.
  await page.evaluate(() => localStorage.clear())
}
async function type(words) {
  await page.keyboard.type(words, { delay: 15 })
  await wait(450)
}
// ⌥⌘↵: saved, and the box stays open for the next one.
async function send() {
  await page.keyboard.press('Alt+Meta+Enter')
  await wait(1200)
}
const only = (process.env.ONLY ?? '').split(',').filter(Boolean)
async function check(name, run) {
  if (only.length && !only.some((one) => name.includes(one))) return
  try {
    await fresh()
    await run()
    results.push(`ok   ${name}`)
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`)
  }
}
const expect = (truth, said) => {
  if (!truth) throw new Error(said)
}


// --- timers -------------------------------------------------------------------
await check('timer: lit, kept plain by a click, sent: no timer, a capture', async () => {
  await type('5m tea')
  expect(await lit('timer') === 1, 'no timer light on "5m"')
  expect((await willDo()).includes('Start a 5 min timer for tea'), `This will says: ${await willDo()}`)
  await page.click(`${EDITOR} .box-token[data-box-token="timer"]`)
  await wait()
  expect(await lit('timer') === 0, 'still lit after the click')
  await send()
  expect(!(await v('focus:now')), 'a timer started anyway')
  expect(await capture('5m tea'), 'no capture "5m tea"')
})
await check('timer: undo lights it again (⌘Z)', async () => {
  await type('10m stretch')
  await page.click(`${EDITOR} .box-token[data-box-token="timer"]`)
  await wait()
  expect(await lit('timer') === 0, 'not kept plain')
  await page.keyboard.press('Meta+z')
  await wait()
  expect(await lit('timer') === 1, 'not lit again after ⌘Z')
  expect((await page.evaluate((s) => document.querySelector(s)?.textContent, EDITOR)) === '10m stretch', 'the words changed')
})
await check('timer: left lit and sent, the timer runs', async () => {
  await type('7m pasta')
  await send()
  const focus = await v('focus:now')
  expect(focus, 'no timer running')
  expect(!(await capture('7m pasta')), 'kept as a capture as well')
  await v('session:cancel', focus.id ?? focus.sessionId)
})

// --- a task's words -----------------------------------------------------------
await check('date: Backspace after it keeps it plain; the task has no date', async () => {
  await type('Call mom tomorrow 5pm')
  expect(await lit('date') === 1, 'no date light')
  await page.keyboard.press('Backspace')
  await wait()
  expect(await lit('date') === 0, 'Backspace did not keep it plain')
  expect((await page.evaluate((s) => document.querySelector(s)?.textContent, EDITOR)) === 'Call mom tomorrow 5pm', 'Backspace deleted a letter')
  await type(' p1')
  expect(await lit('priority') === 1, 'no priority light')
  await send()
  const made = await task('Call mom')
  expect(made, 'no task made')
  expect(!made.dueAt, `it has a date: ${made.dueAt}`)
  expect(made.title.includes('tomorrow 5pm'), `the words left its title: ${made.title}`)
  expect(made.priority === 1, `priority ${made.priority}`)
})
await check('date: left lit, the task has its date', async () => {
  await type('Call dad tomorrow 5pm')
  await send()
  const made = await task('Call dad')
  expect(made?.dueAt, 'no date on the task')
  expect(new Date(made.dueAt).getHours() === 17, `wrong hour ${made.dueAt}`)
})
await check('repeat and reminder: × under the box keeps the repeat plain', async () => {
  await type('Water plants every week !alert')
  expect(await lit('repeat') === 1 && await lit('notify') === 1, 'repeat or reminder not lit')
  await page.click('[data-will="repeat"] [data-will-off]')
  await wait()
  expect(await lit('repeat') === 0, 'still lit after ×')
  await send()
  const made = await task('Water plants')
  expect(made && !made.recurrence, `repeats: ${made?.recurrence}`)
  expect(made.notify === 'alerts', `reminder ${made.notify}`)
})
await check('deadline and until: lit and sent, both kept', async () => {
  await type('Stretch every day until december')
  expect(await lit('repeat') >= 1, 'not lit')
  await send()
  const made = await task('Stretch')
  expect(made?.recurrence === 'every day' && made.repeatUntil, `recurrence ${made?.recurrence} until ${made?.repeatUntil}`)
  await fresh()
  await type('File taxes by friday')
  expect(await lit('deadline') === 1, 'no deadline light')
  await send()
  const due = await task('File taxes')
  expect(due?.deadline && !due.dueAt, `deadline ${due?.deadline} due ${due?.dueAt}`)
})

// --- action tags --------------------------------------------------------------
await check('#bug: kept plain, no task; the tag stays in the words', async () => {
  await type('Login breaks #bug')
  expect(await lit('task-tag') === 1, 'no #bug light')
  await page.click(`${EDITOR} .box-token[data-box-token="task-tag"]`)
  await wait()
  await send()
  expect(!(await task('Login breaks')), 'a task was made')
  const kept = await capture('Login breaks')
  expect(kept && kept.status === 'open', 'not kept as an open capture')
})
await check('#bug: left lit, a task', async () => {
  await type('Signup breaks #bug')
  await send()
  expect(await task('Signup breaks'), 'no task made')
})

// --- #bit and #book -----------------------------------------------------------
await check('#bit: kept plain, not private; lit, private', async () => {
  await type('A pun about owls #bit')
  expect(await lit('bit') === 1, 'no #bit light')
  await page.click(`${EDITOR} .box-token[data-box-token="bit"]`)
  await wait()
  await send()
  expect((await capture('pun about owls'))?.private === 0, 'private anyway')
  await fresh()
  await type('A pun about cats #bit')
  await send()
  expect((await capture('pun about cats'))?.private === 1, 'not private')
})
await check('#book: kept plain, not a book; lit, a book', async () => {
  await type('Dune #book')
  expect(await lit('book') === 1, 'no #book light')
  await page.click(`${EDITOR} .box-token[data-box-token="book"]`)
  await wait()
  await send()
  const plain = await capture('Dune')
  expect(!(await v('notes:tags', 'captures', plain.id)).includes('book'), 'still a book')
  await fresh()
  await type('Hyperion #book')
  await send()
  const book = await capture('Hyperion')
  expect((await v('notes:tags', 'captures', book.id)).includes('book'), 'not a book')
})

// --- a quote's signature ------------------------------------------------------
await check('signature: kept plain, no who and the tail stays', async () => {
  await type('"Stay hungry, stay foolish" - Steve Jobs')
  expect(await lit('signature') === 1, 'no signature light')
  const who = () => page.evaluate(() => [...document.querySelectorAll('input')].map((one) => one.value).join('|'))
  expect((await who()).includes('Steve Jobs'), `Who said it not filled: ${await who()}`)
  await page.click(`${EDITOR} .box-token[data-box-token="signature"]`)
  await wait()
  expect(!(await who()).includes('Steve Jobs'), 'Who said it still filled')
  await send()
  const kept = await capture('Stay hungry')
  expect(kept && !kept.attribution, `attribution ${kept?.attribution}`)
  expect(kept.label.includes('Steve Jobs'), `tail taken: ${kept.label}`)
})
await check('signature: lit, who said it', async () => {
  await type('"Simplicity is the ultimate sophistication" - Leonardo')
  await send()
  const kept = await capture('Simplicity')
  expect(kept?.attribution === 'Leonardo', `attribution ${kept?.attribution}`)
})

// --- a bare link --------------------------------------------------------------
await check('link: kept plain, a note; lit, a link', async () => {
  await type('https://example.com/one')
  expect(await lit('link') === 1, 'no link light')
  await page.click(`${EDITOR} .box-token[data-box-token="link"]`)
  await wait()
  await send()
  expect((await capture('example.com/one'))?.kind === 'note', `kind ${(await capture('example.com/one'))?.kind}`)
  await fresh()
  await type('https://example.com/two')
  expect(await lit('link') === 1, 'no link light the second time')
  await send()
  // Its card may already have named it after the page: the newest capture, read by its address.
  await capture('')
  const two = (await captures())[0]
  expect(two?.kind === 'link' && two.medium, `not a link: ${JSON.stringify(two && { kind: two.kind, label: two.label, medium: two.medium })}`)
})

// --- "+name:" clues ----------------------------------------------------------
await check('+name with no match: Make it a new question, then the clue goes in', async () => {
  await type('+How are Luke and Leia related?: They share a father')
  expect(await lit('clue-miss') === 1, 'no light on +name')
  const said = await willDo()
  expect((said.includes('No question or goal matches') || said.includes('No questions or goals yet')) && said.includes('Make it a new question') && said.includes('Keep as plain text'), `said: ${said}`)
  await page.click('[data-will-new]')
  await wait(1200)
  expect(await lit('clue') === 1, 'not a clue after making the question')
  await send()
  const question = (await v('items', 'question')).find((one) => one.title.includes('Luke and Leia'))
  expect(question?.clues === 1, `clues ${question?.clues}`)
  expect(!(await capture('Luke and Leia')), 'kept as a capture as well')
})
await check('+name matched, kept plain: a capture, no clue', async () => {
  await type('+Luke and Leia: another thought')
  expect(await lit('clue') === 1, 'no clue light')
  await page.click(`${EDITOR} .box-token[data-box-token="clue"]`)
  await wait()
  await send()
  const question = (await v('items', 'question')).find((one) => one.title.includes('Luke and Leia'))
  expect(question?.clues === 1, `a clue was added: ${question?.clues}`)
  expect(await capture('another thought'), 'not kept as a capture')
})
await check('+name with no match: Keep as plain text', async () => {
  await type('+Nobody here: words')
  await page.click('[data-will-plain]')
  await wait()
  expect(await lit('clue-miss') === 0, 'still lit')
  expect(!(await willDo()), `still says: ${await willDo()}`)
})

await check('hover: the hint says what it does and how to keep it plain', async () => {
  await type('25m reading')
  await page.hover(`${EDITOR} .box-token[data-box-token="timer"]`)
  await wait()
  const hint = await page.evaluate(() => document.querySelector('[data-token-hint]')?.textContent ?? '')
  expect(hint.includes('Start a 25 min timer') && hint.includes('Click to keep as plain text'), `hint: ${hint}`)
})

// --- kept plain, with the draft ---------------------------------------------
await check('kept plain survives a reload of the box and a quit and relaunch', async () => {
  await type('5m exercise')
  await page.click(`${EDITOR} .box-token[data-box-token="timer"]`)
  // The draft is written a moment after typing stops.
  await wait(1800)
  await page.reload()
  await page.waitForSelector(EDITOR)
  await wait(1200)
  expect((await page.evaluate((e) => document.querySelector(e)?.textContent, EDITOR)) === '5m exercise', 'the draft did not come back after a reload')
  expect(await lit('timer') === 0, 'lit again after a reload')
  const child = qa.electron.process()
  await qa.close?.()
  try { child.kill('SIGKILL') } catch {}
  qa = await open()
  page = qa.page
  listen()
  await wait(1500)
  expect((await page.evaluate((e) => document.querySelector(e)?.textContent, EDITOR)) === '5m exercise', 'the draft did not come back after a relaunch')
  expect(await lit('timer') === 0, 'lit again after a relaunch')
  await page.click(EDITOR)
  await page.keyboard.press('Meta+ArrowDown')
  await send()
  expect(!(await v('focus:now')), 'a timer started after the relaunch')
  expect(await capture('5m exercise'), 'not kept as a capture')
})

// --- pictures ------------------------------------------------------------------
if (process.env.SHOTS) {
  mkdirSync(process.env.SHOTS, { recursive: true })
  for (const theme of ['github', 'light']) {
    await page.evaluate((name) => localStorage.setItem('theme', name), theme)
    await page.reload()
    await page.waitForSelector(EDITOR)
    await wait(1200)
    for (const [name, words] of [['task', 'Call mom tomorrow 5pm p1 every week #bug'], ['timer', '5m tea'], ['clue', '+How are Luke and Leia related?: They share a father'], ['miss', '+Who is Rey: nobody knows']]) {
      await qa.reset()
      // Off screen the frosted window has nothing behind it: drawn solid, as the light theme is.
      await page.evaluate(() => (document.documentElement.dataset.solid = ''))
      await type(words)
      await wait(1500)
      if (name === 'timer') {
        await page.hover(`${EDITOR} .box-token[data-box-token="timer"]`)
        await wait()
      }
      await page.screenshot({ path: `${process.env.SHOTS}/${name}-${theme === 'light' ? 'light' : 'dark'}.png` })
    }
    await qa.reset()
  }
}

console.log(results.join('\n'))
if (errors.length) console.log(errors.join('\n'))
if (warnings.length) console.log(`console:\n${[...new Set(warnings)].join('\n')}`)
const child = qa.electron.process()
await qa.close?.()
try { child.kill('SIGKILL') } catch {}
process.exit(results.some((one) => one.startsWith('FAIL')) || errors.length ? 1 : 0)
