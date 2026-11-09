// Today written out IS the Tasks list: "Write out my day" puts the caret on a
// new line at the end of Today's own list, not on a second page. The line being
// written has the list's circle on the list's edge, its words start where a
// row's words start at the same size, and it is as tall as a row. Typed lines
// become rows in place, ↵ makes the next, ⇥ a step of the one above, ⇧⇥ out,
// ⌫ on an empty line takes it away, Esc leaves; O on a row starts a line under
// it, a click under the list starts one at the end; the bar never moves. Frames
// every 50ms while three tasks and a step are typed, light and dark.
//   QA_SHOTS=dir QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-merge.mjs
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const SHOT = process.env.QA_SHOTS ?? '/tmp/day-merge'
mkdirSync(SHOT, { recursive: true })
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 860 })
const { h, v, go, both, look } = c
const wait = (ms) => h.waitForTimeout(ms)

const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null }
// Every row and the line being written, read the same way: its circle, where its words start and their size, its height.
const read = () => h.evaluate((boxSrc) => {
  const box = new Function(`return ${boxSrc}`)()
  const rows = [...document.querySelectorAll('[data-task-row]')].map((row) => {
    const words = row.querySelector('[data-task-title] span.truncate')
    return { title: words?.textContent.trim(), circle: box(row.querySelector('[data-task-tick]')), words: { x: Math.round(words.getBoundingClientRect().left), size: getComputedStyle(words).fontSize }, height: box(row)?.h, line: box(row.querySelector('[data-task-title]'))?.h, top: Math.round(row.querySelector('[data-task-title]').getBoundingClientRect().top - row.getBoundingClientRect().top), meta: !!row.querySelector('[data-task-meta]') }
  })
  const line = document.querySelector('[data-write-line]:not([data-step])')
  const input = line?.querySelector('input')
  const writer = line && { circle: box(line.querySelector('span[aria-hidden]')), words: { x: Math.round(input.getBoundingClientRect().left), size: getComputedStyle(input).fontSize }, height: box(line)?.h, line: box(input.parentElement)?.h, top: Math.round(input.getBoundingClientRect().top - line.getBoundingClientRect().top), focused: document.activeElement === input, value: input.value, marks: line.querySelectorAll('mark').length, after: [...document.querySelectorAll('[data-task-row]')].filter((row) => row.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)?.querySelector('[data-task-title] span.truncate')?.textContent.trim() }
  const step = document.querySelector('[data-write-line][data-step]')
  return { rows, writer, step: step && { focused: document.activeElement === step.querySelector('input'), value: step.querySelector('input').value, under: step.closest('[data-task-row]')?.querySelector('[data-task-title] span.truncate')?.textContent.trim() }, panel: !!document.querySelector('[data-task-panel], [data-task-open]') }
}, box.toString())
const bar = () => h.evaluate(() => ['[data-list-tabs]', '[data-write-day]', '[aria-label="More"]'].map((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}` : 'none' }).join(' '))
const titles = async () => (await v('tasks')).filter((t) => t.status === 'open').map((t) => t.title)
// The list where it stands on screen, filmed as each key lands.
let frame = 0
const film = async (name) => {
  const r = await h.evaluate(() => { const el = document.querySelector('[data-task-row]')?.closest('.relative.isolate') ?? document.querySelector('main'); const b = el.getBoundingClientRect(); return { x: Math.max(0, b.left - 40), y: Math.max(0, b.top - 30), width: Math.min(760, b.width + 80), height: Math.min(560, b.height + 140) } })
  await h.screenshot({ path: `${SHOT}/${name}-${String(frame++).padStart(3, '0')}.png`, clip: r })
}
const typeFilmed = async (text, name) => { for (const ch of text) { await h.keyboard.type(ch); await wait(50); await film(name) } }

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false })
  for (const t of (await v('tasks')).filter((t) => t.status === 'open')) await v('task:save', t.id, { status: 'done' })
  const at = (hour) => { const d = new Date(); d.setHours(hour, 0, 0, 0); return d.toISOString() }
  for (const [title, patch] of [['Call the plumber', { due: at(10) }], ['Write the chapter outline', {}], ['Read two essays', {}]]) {
    const one = await v('task:add', title, undefined, true)
    if (Object.keys(patch).length) await v('task:save', one.id, patch)
  }
  // A Today last left on the old written page opens as the list.
  await h.evaluate(() => localStorage.setItem('view:tasks:today', JSON.stringify({ sort: 'manual', group: 'page' })))
  await h.reload(); await wait(1500)
  await go('today'); await wait(1800)
  check('a Today left on the old written page opens as the list', (await read()).rows.length === 3 && !(await h.locator('[data-day-line]').count()))
  const barBefore = await bar()
  check('the bar says “Write out my day”, one button, not pressed', (await h.locator('[data-write-day]').innerText()).trim() === 'Write out my day' && !(await h.locator('[data-write-day][aria-pressed]').count()))
  await both(`${SHOT}/list`)

  for (const theme of ['light', 'dark']) {
    await look(theme); await wait(300)
    frame = 0
    await h.locator('[data-write-day]').click(); await wait(500)
    let now = await read()
    check(`${theme}: “Write out my day” puts the caret on a new line at the end of the list`, now.writer?.focused && now.writer.after === now.rows.at(-1)?.title, JSON.stringify(now.writer))
    check(`${theme}: the bar did not move`, (await bar()) === barBefore)
    const plain = now.rows.find((one) => !one.meta) ?? now.rows[0]
    check(`${theme}: the line's circle is a row's circle, same size and edge`, JSON.stringify(now.writer.circle) === JSON.stringify(plain.circle), `${JSON.stringify(now.writer.circle)} vs ${JSON.stringify(plain.circle)}`)
    check(`${theme}: its words start where a row's do, at the same size`, JSON.stringify(now.writer.words) === JSON.stringify(plain.words), `${JSON.stringify(now.writer.words)} vs ${JSON.stringify(plain.words)}`)
    check(`${theme}: its words sit as high in it as a row's title, on a line as tall`, now.writer.top === plain.top && now.writer.line === plain.line && (plain.meta || now.writer.height === plain.height), `top ${now.writer.top} vs ${plain.top}, line ${now.writer.line} vs ${plain.line}, height ${now.writer.height} vs ${plain.height}`)
    await film(`film-${theme}`)
    const suffix = theme === 'light' ? 'A' : 'B'
    await typeFilmed(`Buy milk ${suffix} 6pm !!`, `film-${theme}`)
    now = await read()
    check(`${theme}: the time and priority light up as they are typed`, now.writer.marks >= 2, `${now.writer.marks} marks`)
    await h.keyboard.press('Enter'); await wait(700); await film(`film-${theme}`)
    now = await read()
    check(`${theme}: ↵ makes it a row and the caret moves to a line under it`, now.rows.some((one) => one.title === `Buy milk ${suffix}`) && now.writer?.focused && now.writer.value === '' && now.writer.after === `Buy milk ${suffix}`, JSON.stringify(now.writer))
    await typeFilmed(`Ask Sam ${suffix}`, `film-${theme}`)
    await h.keyboard.press('Enter'); await wait(700); await film(`film-${theme}`)
    await typeFilmed(`Post the card ${suffix}`, `film-${theme}`)
    await h.keyboard.press('Enter'); await wait(700); await film(`film-${theme}`)
    await typeFilmed('Buy a stamp', `film-${theme}`)
    await h.keyboard.press('Tab'); await wait(500); await film(`film-${theme}`)
    now = await read()
    check(`${theme}: ⇥ makes the line a step of the task above, its words going with it`, now.step?.focused && now.step.value === 'Buy a stamp' && now.step.under === `Post the card ${suffix}`, JSON.stringify(now.step))
    await h.keyboard.press('Enter'); await wait(800); await film(`film-${theme}`)
    const card = (await v('tasks')).find((t) => t.title === `Post the card ${suffix}`)
    check(`${theme}: ↵ keeps the step on its task`, card?.subtasks?.some((one) => one.text === 'Buy a stamp'), JSON.stringify(card?.subtasks))
    await typeFilmed('Back out', `film-${theme}`)
    await h.keyboard.press('Shift+Tab'); await wait(500); await film(`film-${theme}`)
    now = await read()
    check(`${theme}: ⇧⇥ takes it out to a task line again`, !now.step && now.writer?.focused && now.writer.value === 'Back out', JSON.stringify(now.writer))
    await h.keyboard.press('Meta+a'); await h.keyboard.press('Backspace'); await wait(200)
    await h.keyboard.press('Backspace'); await wait(500); await film(`film-${theme}`)
    now = await read()
    check(`${theme}: ⌫ on an empty line takes it away`, !now.writer && !now.step)
    check(`${theme}: three tasks were made, each once`, (await titles()).filter((one) => one.endsWith(` ${suffix}`)).length === 3, (await titles()).join(', '))
  }

  // O on a row starts a line right under it, and opens nothing.
  await h.mouse.move(5, 5)
  await h.keyboard.press('ArrowDown'); await wait(250)
  const first = await h.evaluate(() => document.querySelector('[data-task-row][data-cursor] [data-task-title] span.truncate')?.textContent.trim())
  await h.keyboard.press('o'); await wait(500)
  let now = await read()
  check('O on a row starts a new line under it, and opens no task', now.writer?.focused && now.writer.after === first && !now.panel, `${now.writer?.after} / ${first}`)
  await h.keyboard.type('Left alone')
  await h.keyboard.press('Escape'); await wait(800)
  now = await read()
  check('Esc leaves the line, keeping its words as a task', !now.writer && (await titles()).includes('Left alone'))
  // A click in the space under the list starts one at the end.
  await h.locator('[data-write-here]').click(); await wait(500)
  now = await read()
  check('a click under the list starts a line at its end', now.writer?.focused && now.writer.after === now.rows.at(-1)?.title, JSON.stringify(now.writer))
  await h.keyboard.press('Escape'); await wait(400)
  // From ⌘K, from another tab.
  await go('upcoming'); await wait(1000)
  await h.keyboard.press('Meta+k'); await wait(600)
  await h.keyboard.type('Write out my day', { delay: 10 }); await wait(500)
  await h.keyboard.press('Enter'); await wait(1500)
  now = await read()
  check('⌘K “Write out my day” opens Today with the caret at the end of its list', now.writer?.focused && now.writer.after === now.rows.at(-1)?.title, `${JSON.stringify(now.writer)} focus on ${await h.evaluate(() => document.activeElement?.outerHTML.slice(0, 120))}`)
  await h.keyboard.press('Escape'); await wait(300)
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
}
await c.close()
done()
