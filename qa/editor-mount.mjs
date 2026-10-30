// Every editor page opened, and opened fast one after another, throws nothing: the selection menu, table
// grips, picture viewer, spelling pill, task links, link editor, outline, writing sound and the editor's own
// listeners wait for the editor to be on the page (lib/editor-dom.ts) instead of reading tiptap's
// view.dom before it is there ("The editor view is not available").
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-q/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/editor-mount.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h, go, send, v, errors } = c
const wait = (ms) => h.waitForTimeout(ms)
const viewErrors = () => errors.filter((one) => /view is not available|reading 'dom'|view\.dom/i.test(one))
try {
  await v('settings:set', { sounds: false, hintRate: 0, writingSound: 'rain' })
  const notes = (await v('items', 'article')).slice(0, 4)
  const gems = (await v('items', 'nugget')).slice(0, 3)
  for (const page of ['day', 'articles', 'nuggets', 'inbox', 'today']) { await go(page); await wait(400) }
  check('the pages with editors open with no editor error', viewErrors().length === 0, viewErrors()[0])
  for (const one of [...notes, ...gems]) { await send(one.type ?? 'article', one.id); await wait(500) }
  check('notes and gems open with no editor error', viewErrors().length === 0, viewErrors()[0])
  // Fast: a note asked for before the last one was drawn, round and round.
  for (let round = 0; round < 3; round++) for (const one of notes) { await send(one.type ?? 'article', one.id); await wait(60) }
  await go('day'); await wait(60); await go('articles'); await wait(60); await go('day'); await wait(1200)
  check('opened one after another, fast, still no editor error', viewErrors().length === 0, viewErrors()[0])
  check('no page error at all', !errors.some((one) => one.startsWith('PAGEERROR')), errors.find((one) => one.startsWith('PAGEERROR')))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
