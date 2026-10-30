// A tag typed into a task's line ("call mum #family tomorrow") never shows as part of its name anywhere: Today,
// Tasks, Calendar, ⌘K and the side panel show "call mum", the tag as a tag.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-f/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/task-tag-name.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 900 })
const { h, go, v } = c
const wait = (ms) => h.waitForTimeout(ms)
// Any text on screen where the tag still sits inside the name.
const leaks = () => h.evaluate(() => {
  const out = []
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walk.nextNode()) {
    const node = walk.currentNode
    const box = node.parentElement?.getBoundingClientRect()
    if (/call mum\s*#family|mum #family/i.test(node.textContent) && box && box.width > 0 && !node.parentElement.closest('[contenteditable="true"], input, textarea')) out.push((node.parentElement.closest('[cmdk-item], [data-row]')?.outerHTML ?? node.parentElement.outerHTML).slice(0, 500))
  }
  return out
})
const named = () => h.evaluate(() => [...document.querySelectorAll('body *')].some((one) => one.children.length === 0 && /^call mum$/i.test(one.textContent.trim()) && one.getBoundingClientRect().width > 0))
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  const today = await v('task:add', 'call mum #family today', null, true)
  await v('task:add', 'ring gran #family tomorrow')
  // As quick capture keeps a task line (App.tsx: captures:create with the Task kind, ⌘↵).
  const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  await h.evaluate((body) => window.api.captures.create({ title: '', kind: 'todo', elapsedMs: 900, body, markdown: 'call mum #family tomorrow', attribution: '' }), { type: 'doc', content: [para('call mum #family tomorrow')] })
  await wait(800)
  console.log('tasks:', JSON.stringify((await v('tasks')).filter((one) => /mum|gran/.test(one.title)).map((one) => one.title)))
  for (const page of ['today', 'calendar', 'matrix', 'home']) {
    await go(page); await wait(1200)
    const bad = await leaks()
    check(`${page}: the tag is not in the task's name`, bad.length === 0, bad.join(' / '))
  }
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
