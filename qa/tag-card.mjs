// A tag's hover card says how many notes carry it and its three newest, the
// same card wherever a tag is: a note's Properties chip, a #tag in its words,
// a list row's tag and the sidebar's tag list. No empty foot under a rule.
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/tag-card.mjs
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go } = c
const wait = (ms) => h.waitForTimeout(ms)
const results = []
const check = (name, ok, detail = '') => (results.push(!!ok), console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`))
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const card = () => h.locator('[data-note-preview]')
const rest = async (locator) => {
  await h.mouse.move(5, 5); await wait(700)
  const box = await locator.boundingBox()
  await h.mouse.move(box.x - 30, box.y - 30)
  await h.mouse.move(box.x + 4, box.y + box.height / 2, { steps: 4 })
  await wait(1100)
}
const read = async () => ({
  title: await card().locator('[data-preview-title]').textContent().catch(() => ''),
  count: await card().locator('[data-preview-count]').textContent().catch(() => ''),
  latest: await card().locator('[data-preview-latest] li').allTextContents().catch(() => []),
  text: await card().innerText().catch(() => '')
})
const good = (one, where) => {
  check(`${where}: the card names the tag`, one.title === '#cardz', one.title)
  check(`${where}: it says how many notes`, one.count === '4 notes', one.count)
  check(`${where}: and the three newest`, one.latest.length === 3 && one.latest[0] === 'fourth carded note', JSON.stringify(one.latest))
  check(`${where}: no placeholder sentence`, !one.text.includes('Every note tagged'))
}
try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await v('onboarding:set', { pageHints: false })
  let last
  for (const word of ['first', 'second', 'third', 'fourth']) {
    last = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc(`${word} carded note #cardz`))
    await wait(30)
  }
  const shownIn = (await v('settings')).sidebarShown
  await v('settings:set', { sidebarShown: [...new Set([...shownIn, 'tags'])] })
  await h.evaluate(() => (localStorage.setItem('tags:pinned', JSON.stringify(['cardz'])), window.dispatchEvent(new Event('haligtree:tag-pins'))))
  await h.reload(); await wait(2500)

  // The sidebar.
  const unfold = h.getByRole('button', { name: 'Show your tags' }).first()
  if (await unfold.isVisible().catch(() => false)) (await unfold.click(), await wait(700))
  // The sandbox has more than 12 tags: found with the list's own field.
  if (await h.locator('[data-side-tag-find] input').count()) (await h.locator('[data-side-tag-find] input').fill('cardz'), await wait(300), await h.locator('[data-side-tag-find] input').blur())
  const side = h.locator('[data-side-tag="cardz"]')
  if (await side.count()) { await rest(side); good(await read(), 'sidebar') } else check('sidebar: #cardz is listed', false)

  // A list row's tag: on the tag page of another tag the row carries.
  await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }), doc('a row with #rowz and #cardz'))
  await wait(500)
  await go('tags'); await wait(800)
  await h.evaluate(() => [...document.querySelectorAll('[data-row]')].find((one) => one.textContent.trim().startsWith('rowz'))?.click()); await wait(1500)
  const chip = h.locator('[data-tag-go][data-tag="cardz"]').first()
  if (await chip.count()) {
    await rest(chip)
    const one = await read()
    check('list row: the card names the tag', one.title === '#cardz', one.title)
    check('list row: it says how many notes', one.count === '5 notes', one.count)
    const tips = await h.locator('[role="tooltip"]:not([data-note-preview])').allTextContents()
    check('list row: no tooltip of its own', !tips.some((one) => one.includes('cardz')), JSON.stringify(tips))
  } else check('list row: its #cardz chip is there', false)

  // The note itself: its Properties chip and a #tag in its words.
  await h.evaluate((id) => window.api.openInHome('capture', id), last); await wait(1800)
  const props = h.locator('[data-property="tags"] [data-tag-open="cardz"]').first()
  if (!(await props.isVisible().catch(() => false))) { await h.locator('button:has-text("Properties")').first().click().catch(() => {}); await wait(500) }
  if (await props.count()) {
    await rest(props)
    const one = await read()
    check('Properties: says how many', /^\d+ notes$/.test(one.count ?? ''), one.count)
    check('Properties: no placeholder sentence', !one.text.includes('Every note tagged'))
  } else check('Properties: the #cardz chip is there', false)
  const inline = h.locator('.ProseMirror .tiptap-token[data-token="tag"]', { hasText: 'cardz' }).first()
  if (await inline.count()) {
    await rest(inline)
    const one = await read()
    check('inline #tag: the card names the tag', one.title === '#cardz', one.title)
    check('inline #tag: says how many', /^\d+ notes$/.test(one.count ?? ''), one.count)
    check('inline #tag: says what a click does', one.text.includes('⌥-click to edit'), one.text)
  } else check('inline #tag: there', false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
