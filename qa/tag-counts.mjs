// A tag's count is the same everywhere: the sidebar, the Tags list, its page's
// "N items" and Often with. Each counts what the page shows at first: open and
// resolved notes, gems, open tasks. A task done and a to-do dealt with wait
// under "N more resolved or done"; archived and binned ones are out of it.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tag-counts.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const create = (text, kind = 'note') => h.evaluate(([b, k]) => window.api.captures.create({ kind: k, body: b }), [doc(text), kind])
const save = (id, patch) => h.evaluate(([id, p]) => window.api.captures.save(id, p), [id, patch])
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  // Shown: an open note, a resolved one, an open task. Both also carry #pairz.
  await create('an open note #countz #pairz')
  const resolved = await create('a resolved note #countz #pairz')
  await save(resolved, { status: 'resolved' })
  await v('task:add', 'an open task #countz')
  // Under a click: a task done, a to-do dealt with, a note made into a task.
  const done = (await v('task:add', 'a done task #countz')).id
  await v('task:done', done)
  const todo = await create('a to-do dealt with #countz', 'todo')
  await save(todo, { status: 'resolved' })
  // Out of it: archived, in the Bin.
  const archived = await create('an archived note #countz #pairz')
  await v('notes:archive', 'captures', [archived], true)
  const binned = await create('a binned note #countz #pairz')
  await save(binned, { status: 'discarded' })
  // A note made into a task: the task is shown, the note waits with the done ones.
  await v('toTask', await create('made into a task #countz'))
  // Twice in one note counts once.
  await create('twice #countz and #countz again')
  const SHOWN = 5
  const LATER = 3

  const tags = await v('tags')
  const row = tags.find((one) => one.tag === 'countz')
  check('the count is what shows at first', row?.count === SHOWN, `${row?.count} / ${SHOWN}`)
  check('the done ones are counted apart', row?.later === LATER, `${row?.later} / ${LATER}`)
  const read = await v('tag:read', 'countz')
  check('the page reads the same notes the count counts', read.length === SHOWN + LATER && read.filter((one) => !one.later).length === SHOWN, `${read.length} read, ${read.filter((one) => !one.later).length} shown`)

  // The sidebar: pinned so it is listed whatever else the sandbox holds.
  await h.evaluate(() => (localStorage.setItem('tags:pinned', JSON.stringify(['countz'])), window.dispatchEvent(new Event('haligtree:tag-pins'))))
  const shownIn = (await v('settings')).sidebarShown
  await v('settings:set', { sidebarShown: [...new Set([...shownIn, 'tags'])] })
  await h.reload(); await wait(2500)
  const unfold = h.getByRole('button', { name: 'Show your tags' }).first()
  if (await unfold.isVisible().catch(() => false)) (await unfold.click(), await wait(700))
  const side = await h.evaluate(() => [...(document.querySelector('[data-side-tag="countz"]')?.querySelectorAll('.tabular-nums') ?? [])].pop()?.textContent.trim())
  // The rolling digits keep a copy of each for the roll: one number, however many copies.
  check('the sidebar says the same', new RegExp(`^(${SHOWN})+$`).test(side ?? ''), side)

  // The Tags list.
  await go('tags'); await wait(800)
  const listed = await h.evaluate(() => [...document.querySelectorAll('[data-row]')].find((one) => one.textContent.trim().startsWith('countz'))?.querySelector('.tabular-nums')?.textContent.trim())
  check('the Tags list says the same', listed === String(SHOWN), listed)

  // The page.
  await h.evaluate(() => [...document.querySelectorAll('[data-row]')].find((one) => one.textContent.trim().startsWith('countz'))?.click()); await wait(1500)
  const page = () => h.evaluate(() => ({
    meta: document.querySelector('header p.line-clamp-2')?.textContent.trim() ?? '',
    entries: document.querySelectorAll('article[data-private], article.group\\/entry').length,
    often: [...document.querySelectorAll('section h2')].find((one) => one.textContent.startsWith('Often with'))?.parentElement?.textContent ?? ''
  }))
  let p = await page()
  check('the page says "5 items"', p.meta.startsWith(`${SHOWN} items`), p.meta)
  check('and says what waits: "3 more resolved or done"', p.meta.includes(`${LATER} more resolved or done`), p.meta)
  check('it shows those 5', p.entries === SHOWN, String(p.entries))
  check('Often with counts the shown ones: 2 notes have both #pairz', /pairz2 notes have both/.test(p.often.replace(/\s+/g, '')) || p.often.includes('2 notes have both'), p.often)
  await h.locator('header [data-later]').first().click(); await wait(900)
  p = await page()
  check('a click shows the 3 more', p.entries === SHOWN + LATER, String(p.entries))
  check('and offers to hide them again', p.meta.includes(`hide the ${LATER} resolved or done`), p.meta)
  if (c.errors.length) console.log(c.errors.join('\n'))
  check('no page errors', !c.errors.some((one) => one.includes('PAGEERROR')), c.errors.join(' | ').slice(0, 300))
} finally { await c.close() }
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
