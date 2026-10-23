// The Day page's writing looks like a place to type and takes the caret on
// open: the "Today" row opens on it with the caret inside, typing saves the
// day's page, and an empty day shows a box with an edge, room and a prompt
// line, above the day's tasks. The Week page's writing is a box the same way.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/day-page-write.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, v, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const key = (d) => d.toLocaleDateString('en-CA')

/** The writing box on the page in front: its edge, size, prompt, and whether the caret is in it. */
const box = (sel) => h.evaluate((sel) => {
  const one = document.querySelector(`[data-page] ${sel}`)
  if (!one) return null
  const style = getComputedStyle(one)
  const page = getComputedStyle(document.body)
  const empty = one.querySelector('.is-empty, .is-editor-empty')
  return {
    border: parseFloat(style.borderTopWidth),
    edge: style.borderTopColor,
    fill: style.backgroundColor,
    page: page.backgroundColor,
    height: Math.round(one.getBoundingClientRect().height),
    top: Math.round(one.getBoundingClientRect().top),
    prompt: empty?.getAttribute('data-placeholder') ?? null,
    caret: !!document.activeElement && one.contains(document.activeElement),
    editable: !!one.querySelector('[contenteditable="true"]')
  }
}, sel)

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  // 1. From another page, the Today row: the Day page with the caret in its writing.
  await go('inbox')
  await h.locator('nav [data-side-row][aria-label="Today"]').first().click()
  await wait(1500)
  const today = await box('[data-day-write]')
  check('1. the Today row opens the Day page', await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page')) === 'day')
  check('1. its writing is a box with a visible edge', !!today && today.border >= 1 && today.edge !== today.fill, JSON.stringify(today))
  check('1. the caret is in it', !!today?.caret, JSON.stringify(today))
  const tasks = await h.evaluate(() => {
    const heading = [...document.querySelectorAll('[data-page] p, [data-page] h2')].find((one) => /Today’s tasks|Coming back to you/.test(one.textContent))
    return heading ? Math.round(heading.getBoundingClientRect().top) : null
  })
  check('1. the writing is above today\'s tasks', tasks === null || (today && today.top < tasks), `${today?.top} vs ${tasks}`)

  // 2. Typing saves the day's page.
  const words = `Probe line ${Date.now()}`
  await h.keyboard.type(words)
  await wait(1800)
  const saved = await v('notes:day', key(new Date()))
  check('2. typing saves the day', JSON.stringify(saved?.body ?? '').includes(words), JSON.stringify(saved?.body ?? '').slice(0, 200))

  // 3. An empty day: a box with room and a prompt line.
  const later = new Date(); later.setDate(later.getDate() + 9)
  await send('day', key(later))
  await wait(1500)
  const empty = await box('[data-day-write]')
  check('3. an empty day\'s box has an edge and room to write', !!empty && empty.border >= 1 && empty.height >= 100, JSON.stringify(empty))
  check('3. it says what to write, inside the box', !!empty?.prompt, String(empty?.prompt))
  check('3. it is editable', !!empty?.editable)
  check('3. the caret goes in it on this day too', !!empty?.caret, JSON.stringify(empty))

  // 4. The Week page: its writing a box too, then the week's tasks.
  await go('weekpage')
  await wait(1500)
  const week = await box('[data-week-write]')
  check('4. the Week page\'s writing is a box with an edge', !!week && week.border >= 1 && week.height >= 80, JSON.stringify(week))
  const weekTasks = await h.evaluate(() => document.querySelector('[data-page] [data-week-tasks]')?.getBoundingClientRect().top ?? null)
  check('4. the week\'s tasks come under it', weekTasks !== null && week && weekTasks > week.top, `${week?.top} vs ${weekTasks}`)
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | '))
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
