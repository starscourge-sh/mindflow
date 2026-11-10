// Worst-case words on everything that floats: a nudge card, the focus pill and
// a goal's card, each given a task or goal named with an address that has no
// spaces, Chinese, Arabic (right to left) and emoji. No words run out of their
// card, under a button, or past the window, in light and dark; frames saved.
//
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 SHOT=<dir> node qa/float-worst.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const SHOT = process.env.SHOT ?? 'scratchpad/float-worst'
mkdirSync(SHOT, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA') }

const WORST = [
  'https://bartholomew.fitzgerald.northwind-industries-holdings.example.com/quarterly-review-notes',
  '準備明天的期末考試並且複習所有的筆記和講義內容',
  'مراجعة ملاحظات المحاضرة قبل الامتحان النهائي يوم الخميس',
  '🌱🌿🍃 Repot the monstera 🪴 and water the ferns 💧💧💧 before the trip ✈️'
]

// Words drawn outside the box that clips them, or past the window's edge, or over a button.
const spills = (page) => page.evaluate(() => {
  const out = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue
    const el = node.parentElement
    if (!el || el.closest('[aria-hidden="true"], svg')) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.opacity === '0') continue
    const range = document.createRange()
    range.selectNodeContents(node)
    const box = range.getBoundingClientRect()
    if (!box.width) continue
    // Cut with an ellipsis: drawn up to its box, the rest only measured.
    if (el.closest('.truncate') || /ellipsis/.test(style.textOverflow)) continue
    let clip = el
    while (clip && clip !== document.body && !['hidden', 'clip'].includes(getComputedStyle(clip).overflowX)) clip = clip.parentElement
    const bound = clip && clip !== document.body ? clip.getBoundingClientRect() : { left: 0, right: innerWidth }
    // A line-clamped box hides its own overflow by design: measure against the box that holds it.
    const own = el.getBoundingClientRect()
    if (box.right > Math.min(bound.right, innerWidth) + 1 || box.left < Math.max(bound.left, 0) - 1 || (style.overflowX === 'hidden' && el.scrollWidth > el.clientWidth + 1 && !/ellipsis/.test(style.textOverflow) && !style.webkitLineClamp?.match(/\d/)))
      out.push(`${node.textContent.trim().slice(0, 30)} [${Math.round(box.left)}..${Math.round(box.right)} in ${Math.round(bound.left)}..${Math.round(bound.right)}, own ${Math.round(own.width)}]`)
    // Under a button: the words' box crosses a button that is not its own.
    for (const button of document.querySelectorAll('button')) {
      if (button.contains(el) || el.contains(button)) continue
      const b = button.getBoundingClientRect()
      if (!b.width) continue
      // Buttons shown only while pointed at sit over the title's end by design.
      let shown = button
      while (shown && getComputedStyle(shown).opacity !== '0') shown = shown.parentElement
      if (shown) continue
      const across = Math.min(box.right, b.right) - Math.max(box.left, b.left)
      // A clamped title's hidden lines are measured but not drawn: only its own box counts.
      const down = Math.min(box.bottom, own.bottom, b.bottom) - Math.max(box.top, b.top)
      if (across > 2 && down > 2) out.push(`${node.textContent.trim().slice(0, 30)} under button "${button.getAttribute('aria-label') ?? button.textContent.trim().slice(0, 20)}"`)
    }
  }
  return [...new Set(out)]
})

const c = await sandbox({ width: 1100, height: 900 })
const { electron, h, v } = c
const windowOf = async (part, not = []) => {
  for (let i = 0; i < 60; i++) {
    const found = electron.windows().find((one) => !one.isClosed() && one.url().includes(part) && !not.includes(one))
    if (found) return found
    await wait(200)
  }
  return null
}
const themed = async (page, name) => {
  for (const theme of ['light', 'dark']) {
    await h.evaluate((t) => localStorage.setItem('theme', t), theme === 'light' ? 'paper' : 'dark')
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })))
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOT}/${name}-${theme}.png` })
    const bad = await spills(page)
    check(`${name}, ${theme}: no words spill`, bad.length === 0, bad.slice(0, 4).join(' | '))
  }
}

try {
  await v('settings:set', { sounds: false, notify: 'alerts', quietStart: '00:00', quietEnd: '00:00', goalBeacon: 'sometimes' })

  // --- Nudge cards: three at once, each with a worst name.
  for (const title of WORST.slice(0, 3)) {
    const made = await v('task:add', title)
    await v('task:save', made?.id ?? made, { allDay: 0, due: new Date(Date.now() - 2 * 60000).toISOString() })
  }
  await v('alerts:check')
  const card = await windowOf('view=nudge')
  await card.waitForSelector('[data-nudge="task"]')
  await card.waitForTimeout(1200)
  check('three worst-named nudges are up', (await card.$$('[data-nudge="task"]')).length >= 3)
  await themed(card, 'nudge')
  // Each said as a "Done" line too.
  await card.evaluate(() => document.querySelectorAll('[data-nudge-done]').forEach((one) => one.click()))
  await card.waitForTimeout(900)
  await themed(card, 'nudge-done')

  // --- The focus pill, on the emoji-and-long task.
  const task = await v('task:add', WORST[0])
  await v('session:start', task?.id ?? task, WORST[3], 25 * 60000)
  await h.evaluate(() => window.api.showFocus(true))
  const pill = await windowOf('view=focus')
  await pill.waitForTimeout(2500)
  await themed(pill, 'pill')

  // --- A goal's own card.
  const goal = await v('goal:new', WORST[0], day(30), day(-3))
  await v('goal:beacon:set', typeof goal === 'string' ? goal : goal.id, 'always')
  await wait(4000)
  const beacon = electron.windows().find((one) => !one.isClosed() && one.url().includes('type=goal&') && one.url().includes(encodeURIComponent(typeof goal === 'string' ? goal : goal.id)))
    ?? await windowOf('type=goal&')
  check('the goal\'s card is up', !!beacon)
  if (beacon) {
    await beacon.waitForTimeout(1500)
    await themed(beacon, 'goal-card')
  }
  check('no errors', c.errors.length === 0, c.errors.join(' | '))
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
  const passed = results.filter(Boolean).length
  console.log(`\n${passed}/${results.length} passed`)
  process.exit(passed === results.length ? 0 : 1)
}
