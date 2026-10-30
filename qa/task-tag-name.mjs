// A tag typed into a task's line ("call mum #family tomorrow") never shows as part of its name anywhere: Today,
// Tasks, Calendar, ⌘K and the side panel show "call mum", the tag as a tag.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-f/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/task-tag-name.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v, electron, both } = c
const wait = (ms) => h.waitForTimeout(ms)
// Any text on screen where the tag still sits inside the name.
const leaks = () => h.evaluate(() => {
  const out = []
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walk.nextNode()) {
    const node = walk.currentNode
    const box = node.parentElement?.getBoundingClientRect()
    if (/(call mum|ring gran)[^#]*#family|mum[^#]*#family/i.test(node.textContent) && box && box.width > 0 && !node.parentElement.closest('[contenteditable="true"], input, textarea')) out.push((node.parentElement.closest('[cmdk-item], [data-row]')?.outerHTML ?? node.parentElement.outerHTML).slice(0, 500))
  }
  return out
})
const named = () => h.evaluate(() => [...document.querySelectorAll('body *')].some((one) => one.children.length === 0 && /^call mum$/i.test(one.textContent.trim()) && one.getBoundingClientRect().width > 0))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const today = await v('task:add', 'call mum #family today', null, true)
  await v('task:add', 'ring gran #family tomorrow')
  // Later (no date) and one done, so the Later and All tabs, the Report and the stickies have one each.
  await v('task:add', 'call mum about the car #family')
  const doneOne = await v('task:add', 'call mum back #family today')
  await v('task:done', doneOne?.id ?? doneOne)
  // As quick capture keeps a task line (App.tsx: captures:create with the Task kind, ⌘↵).
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const kept = await h.evaluate((body) => window.api.captures.create({ title: '', kind: 'todo', elapsedMs: 900, body, markdown: 'call mum #family tomorrow', attribution: '' }), { type: 'doc', content: [para('call mum #family tomorrow')] })
  await wait(800)
  console.log('tasks:', JSON.stringify((await v('tasks')).filter((one) => /mum|gran/.test(one.title)).map((one) => one.title)))
  for (const page of ['today', 'upcoming', 'later', 'alltasks', 'calendar', 'matrix', 'home', 'wrap', 'recap', 'week', 'month', 'day']) {
    await go(page); await wait(1200)
    const bad = await leaks()
    check(`${page}: the tag is not in the task's name`, bad.length === 0, bad.join(' / '))
  }
  // The Day page lists the quick capture task line: its words, the tag as a chip.
  await go('day'); await wait(1200)
  check('day: "#family" shows as a chip', await h.evaluate(() => [...document.querySelectorAll('[data-day-log] li, [data-pick]')].some((row) => /call mum/.test(row.textContent) && !/#family/.test(row.querySelector('.private-text, .truncate')?.textContent ?? '#family'))))
  await both(`${process.env.SHOTS ?? process.env.QA_DATA}/task-tag-day`)
  // The kept task line's own sticky on the desktop (an Inbox note), and the Today sticky.
  const leaksIn = (win) => win.evaluate(() => [...document.querySelectorAll('p, button, span')].filter((one) => one.children.length === 0 && /mum[^#]*#family/.test(one.textContent)).map((one) => one.outerHTML.slice(0, 200)))
  const stickyOf = async (part) => { for (let i = 0; i < 40; i++) { const win = electron.windows().find((one) => !one.isClosed() && one.url().includes(part)); if (win) return win; await wait(250) } return null }
  await h.evaluate((one) => window.api.stick('capture', one, true), typeof kept === 'string' ? kept : kept?.id)
  const own = await stickyOf(`id=${typeof kept === 'string' ? kept : kept?.id}`)
  if (own) { await wait(1200); const bad = await leaksIn(own); check('Inbox note sticky: the tag is not in the task\'s name', bad.length === 0, bad.join(' / ')); check('Inbox note sticky: reads "call mum"', await own.evaluate(() => /call mum/.test(document.body.textContent))); await own.screenshot({ path: `${process.env.SHOTS ?? process.env.QA_DATA}/task-tag-sticky.png` }) } else check('Inbox note sticky opened', false)
  await h.evaluate(() => window.api.stick('today', 'today', true))
  const day = await stickyOf('type=today')
  if (day) { await wait(1200); const bad = await leaksIn(day); check('Today sticky: the tag is not in the task\'s name', bad.length === 0, bad.join(' / ')) } else check('Today sticky opened', false)
  await go('today'); await wait(1000)
  check('today: the task reads "call mum"', await named())
  // The side panel, from Tasks.
  await h.locator('[data-row]', { hasText: 'call mum' }).first().click().catch(() => {})
  await wait(900)
  check('side panel: the tag is not in the task\'s name', (await leaks()).length === 0, (await leaks()).join(' / '))
  await h.keyboard.press('Escape'); await wait(400)
  // ⌘K.
  await h.keyboard.press('Meta+k'); await wait(500)
  await h.keyboard.type('call mum'); await wait(900)
  check('⌘K: the tag is not in the task\'s name', (await leaks()).length === 0, (await leaks()).join(' / '))
  await h.keyboard.press('Escape'); await wait(300)
} catch (error) {
  check('ran', false, error.stack)
} finally {
  await c.close()
}
done()
