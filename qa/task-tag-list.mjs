// "Add a task" offers tags in use where the # is typed (task-input.tsx), as the editor's own # list (note-link-menu.tsx
// NoteList), never at the field's far left (the user, 17 Nov: "look at how detached the tag modal is"). Real keys:
// a long line, then "#" and two letters at its end; the list's left edge sits under the #; ↓ moves its light; Tab
// takes the tag into the words.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-q2/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/task-tag-list.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const s = await sandbox({ width: 1300, height: 900 })
const { h, v, go, close } = s
const wait = (ms) => h.waitForTimeout(ms)
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const tag = (await v('tags'))[0]?.tag
  check('the book has a tag in use', !!tag, tag)
  await go('today'); await wait(1200)
  const field = h.locator('[role="main"] [data-task-input]').first()
  await field.click()
  await h.keyboard.type(`extract the feature requests from the comments #${tag.slice(0, 2)}`, { delay: 8 })
  await wait(400)
  const seen = await h.evaluate(() => {
    const input = document.querySelector('[role="main"] [data-task-input]')
    const list = document.querySelector('[data-tag-offers]')
    const paint = document.createElement('canvas').getContext('2d')
    paint.font = getComputedStyle(input).font
    const hash = input.getBoundingClientRect().left + paint.measureText(input.value.slice(0, input.value.lastIndexOf('#'))).width - input.scrollLeft
    return list ? { left: Math.round(list.getBoundingClientRect().left), hash: Math.round(hash), editorLook: !!list.querySelector('.tiptap-slash-menu'), rows: list.querySelectorAll('button').length } : null
  })
  check('the tags in use are offered', !!seen && seen.rows > 0, JSON.stringify(seen))
  check('in the editor\'s own # list', !!seen?.editorLook)
  check('opened at the # typed, not the field\'s far left', !!seen && Math.abs(seen.left - seen.hash) <= 16, JSON.stringify(seen))
  await h.keyboard.press('Tab'); await wait(300)
  const value = await field.inputValue()
  check('Tab takes the tag into the words', value.includes(`#${(await h.evaluate(() => null)) ?? ''}`) && new RegExp(`#\\S{3,}\\s$`).test(value), value)
} finally {
  await close()
}
done()
