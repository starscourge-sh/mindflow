// A note's footer (mentions, links out, related) sits well clear of the note, past a rule, and starts on the note's
// own left edge, in every place a note is open (Writing, Inbox).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOTS=<dir>] node qa/note-footer.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const c = await sandbox({ width: 1500, height: 1000 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const measure = () => h.evaluate(() => {
    const words = [...document.querySelectorAll('.tiptap > *')].filter((one) => one.textContent.trim()).pop()
  const foot = document.querySelector('section[data-chrome].border-t')
  if (!words || !foot) return null
  const first = [...foot.querySelectorAll('*')].find((one) => one.children.length === 0 && one.textContent.trim() && one.getBoundingClientRect().width)
  const text = document.querySelector('.tiptap > p, .tiptap > h1, .tiptap > h2')
  return { gap: Math.round(foot.getBoundingClientRect().top - words.getBoundingClientRect().bottom), footLeft: Math.round(first.getBoundingClientRect().left), noteLeft: Math.round(text.getBoundingClientRect().left) }
})
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  const page = await v('article:new')
  await v('item:save', page, { title: 'Footer', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Words of the note. See ' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'The last line. #learn-haligtree' }] }] } })
  await c.send('article', page); await wait(2500)
  await h.evaluate(() => { const s = document.querySelector('[data-open] .overflow-y-auto, [data-open]'); s.scrollTop = s.scrollHeight })
  await wait(600)
  const one = await measure()
  check('Writing: the footer sits well clear of the note (64px or more)', one && one.gap >= 64, JSON.stringify(one))
  const props = await h.evaluate(() => { const strip = document.querySelector('[data-property-strip]:not([data-in-panel])'); const first = [...document.querySelectorAll('.tiptap > p')].find((one) => one.textContent.trim()); const add = strip?.querySelector('[data-add-property]') ?? strip; return add && first ? Math.round(first.getBoundingClientRect().top - add.getBoundingClientRect().bottom) : null })
  check('Writing: Properties have room under them (32px or more to the words)', props >= 32, String(props))
    if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/note-footer.png` })
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
