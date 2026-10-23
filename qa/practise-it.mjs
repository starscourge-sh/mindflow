// "Practise it" on a repeating task, the way practices work now: the switch
// in a routine's details, the material it opens with, the 5-minute offer at
// the task's own time (its days and time are the task's), the log line and
// "What stuck?" after; and no Practices tab or page left to find.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/practise-it.mjs
import { sandbox, shiftClock } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1200, height: 860 })
const { h, v, send, go, electron, errors } = s
const shot = (name) => process.env.SHOTS && h.screenshot({ path: `${process.env.SHOTS}/${name}.png` }).catch(() => {})
try {
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await h.waitForTimeout(500)
  await v('settings:set', { quietStart: '00:00', quietEnd: '00:00' })
  const made = await v('task:add', 'Spanish every day at 7:30')
  const id = made?.id ?? made
  await send('task', id)
  await h.waitForTimeout(1500)

  // 1. The switch is in the routine's details, off, saying what it does.
  const row = await h.$('[data-practise-it]')
  check('1. a repeating task has "Practise it" in its details', !!row)
  check('1. off to start', (await h.getAttribute('[data-practise-it] [role="switch"]', 'aria-checked').catch(() => null)) === 'false')
  await h.click('[data-practise-it] [role="switch"]')
  await h.waitForTimeout(800)
  const on = await v('practices:of-task', id)
  check('1. turned on, it is a practice of the task', on?.on === true && !!on.id, JSON.stringify(on))
  // Its material: a tag.
  await h.click('[data-slot="island"] button[aria-label="A tag"], button[aria-label="A tag"]')
  await h.waitForTimeout(500)
  await h.fill('input[placeholder="spanish"]', 'spanish')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(800)
  const tagged = await v('practices:of-task', id)
  check('1. it opens with #spanish', tagged?.loadKind === 'tag' && tagged.load === 'spanish', JSON.stringify(tagged))
  await shot('1-switch')

  // 2. At the task's time it is offered, with the task's name.
  const due = await v('task', id).then((one) => one?.dueAt).catch(() => null)
  const at = due ? new Date(due) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 30, 0, 0); return d })()
  at.setMinutes(at.getMinutes() + 2)
  await electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), at.getTime() - Date.now()])
  const offer = await v('practices:check')
  check('2. at its time it offers 5 minutes, by the task\'s name', offer?.id === on.id && offer.name === 'Spanish' && offer.at === '07:30', JSON.stringify(offer))
  // The task renamed: the offer follows.
  await v('task:save', id, { title: 'Spanish verbs' })
  const renamed = await v('practices:offer')
  check('2. renamed, the offer says the new name', renamed?.name === 'Spanish verbs', JSON.stringify(renamed))

  // 3. Practised: a log line, and "What stuck?" kept as a gem.
  const session = await v('practices:start', on.id)
  await electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), at.getTime() + 12 * 60_000 - Date.now()])
  const ended = await v('practices:end', session)
  check('3. ended, it writes a line in its log', !!ended?.line && /spanish verbs/i.test(ended.line), JSON.stringify(ended))
  const gem = await v('practices:stuck', session, 'ser is for what something is')
  check('3. "What stuck?" is kept as a gem on its tag', !!gem)
  const after = await v('practices:of-task', id)
  check('3. the task shows it was practised, and what stuck', after.runs === 1 && after.lastNote === 'ser is for what something is', JSON.stringify(after))

  // 4. Off keeps everything; there is no Practices tab or page to go to.
  await v('practices:set', id, { on: false })
  check('4. off, it is not offered and keeps its log', (await v('practices:offer')) === null && (await v('practices:of-task', id)).runs === 1)
  await go('today')
  check('4. Tasks has no Practices tab', !(await h.$('[data-task-lists] button[aria-label="Practices"]')))
  await go('practices')
  check('4. the old page says where practising went', /Practising is part of a repeating task/.test(await h.evaluate(() => document.body.innerText)))
  await shot('4-old-page')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await s.close()
}
done()
