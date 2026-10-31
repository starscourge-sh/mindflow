// A name shows without its #tags wherever it is shown: a question titled
// "what is business central (BC) #work" reads "what is business central (BC)"
// on its page's title, its "Still open" line, ⌘K, the sidebar and the lists.
// The stored title keeps its tag (it is what was typed), and renaming the
// page keeps it too.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/title-no-tags.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const c = await sandbox({ width: 1200, height: 850 })
const { h, v } = c
const wait = (ms) => h.waitForTimeout(ms)
const SHOTS = process.env.SHOTS

// Every visible place that names it (text or a field's value), and whether any still carries "#work" in the name itself.
const named = (scope = 'body') => h.evaluate((scope) => {
  const out = []
  for (const el of document.querySelectorAll(`${scope} *`)) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height || el.closest('[data-tag], [data-slot="tag"], .mf-tag')) continue
    const own = el.matches('input') ? '' : el.matches('textarea') ? el.value : [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('')
    if (/business central/i.test(own)) out.push(own.trim())
  }
  return out
}, scope)
const clean = (list) => list.length > 0 && list.every((one) => !one.includes('#work'))

try {
  await v('settings:set', { hintRate: 0 })
  const TITLE = 'what is business central (BC) #work'
  const id = await v('question:new', TITLE)
  await c.send('question', id)
  await wait(1200)
  const page = await named('[data-open]')
  check('the page\'s title has no #work', clean(page), JSON.stringify(page))
  if (SHOTS) await c.both(`${SHOTS}/title-no-tags`)
  const side = await named('aside')
  check('the sidebar names it without #work', !side.length || clean(side), JSON.stringify(side))

  // Renamed on the page: the tag is kept in what is stored, as it was typed.
  const field = h.locator('[data-open] textarea[data-page-title]').first()
  await field.click()
  await field.evaluate((el) => el.setSelectionRange(el.value.length, el.value.length))
  await h.keyboard.type('?')
  await h.keyboard.press('Enter')
  await wait(600)
  const stored = (await v('item', id))?.title
  check('renamed, the stored title keeps its tag', stored?.includes('#work') && stored.includes('(BC)?'), stored)
  const after = await named('[data-open]')
  check('and the page still shows it without', clean(after), JSON.stringify(after))

  // ⌘K finds it by its words and names it without the tag.
  await h.keyboard.press('Escape')
  await h.keyboard.press('Meta+k')
  await wait(900)
  await h.keyboard.type('what is business', { delay: 30 })
  await wait(1200)
  const palette = (await named('[role="dialog"]')).filter((one) => !one.startsWith('Keep'))
  check('⌘K names it without #work', clean(palette), JSON.stringify(palette))
  await h.keyboard.press('Escape')
  await wait(300)

  // The questions list, and the "Still open" line that brings it back.
  await c.go('questions')
  await wait(600)
  const list = await named('body')
  check('the Questions list names it without #work', !list.length || clean(list), JSON.stringify(list))
  if (c.errors.length) console.log(c.errors.slice(0, 5).join('\n'))
} finally {
  await c.close()
}
const pass = results.filter(Boolean).length
console.log(`\n${pass}/${results.length} passed`)
process.exit(pass === results.length ? 0 : 1)
