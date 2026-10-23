// Notes' structure (b23 wave 2), in the sandbox: the Properties block sits
// under the title and before the words (an article's too, whose title is kept
// apart), rows carry an icon, the name and the value, tags are one row of
// chips whose x takes the tag out of the words, created and updated show
// read-only, the block folds shut, and an empty note shows only "Add property".
//
//   npx electron-vite build --outDir out-w2
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-w2/main/index.js HALIGTREE_QA_AWAY=1 node qa/b23-wave2.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const c = await sandbox({ width: 1200, height: 820 })
const { h, v, send, go } = c
const { check, done } = checks()
const wait = (ms = 400) => h.waitForTimeout(ms)
const strip = '[data-property-strip]'
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

try {
  await v('settings:set', { safeMode: false, hintRate: 0, rotCount: 0, motion: false })
  for (let i = 0; i < 60 && (await h.evaluate(() => document.body.innerText.includes('Setting out the examples'))); i++) await wait(500)

  // A note with a #book tag: the block, under its title.
  const made = await h.evaluate((doc) => window.api.captures.create({ kind: 'note', body: doc }), { type: 'doc', content: [para('The Dispossessed'), para('An ambiguous utopia #book #zqtag')] })
  await go('captures')
  await send('capture', made)
  await wait(1500)
  const shape = () => h.evaluate((sel) => {
    const box = document.querySelector(sel)
    const page = box?.closest('.tiptap.ProseMirror')
    if (!box || !page) return null
    const lines = [...page.children].filter((one) => !one.classList.contains('mf-property-holder'))
    return { top: box.getBoundingClientRect().top, bottom: box.getBoundingClientRect().bottom, first: lines[0]?.getBoundingClientRect().top, second: lines[1]?.getBoundingClientRect().top, text: box.textContent, head: !!box.querySelector('[data-properties-head]'), tags: [...box.querySelectorAll('[data-tag-chip]')].map((one) => one.getAttribute('data-tag-chip')), icons: box.querySelectorAll('[data-property] svg, .lucide').length }
  }, strip)
  const one = await shape()
  check('note: a "Properties" block between its title and its words', !!one && one.head && one.top >= one.first && one.bottom <= one.second + 1, JSON.stringify(one))
  check('note: tags are one row of chips', !!one && one.tags.includes('book') && one.tags.includes('zqtag'), one?.tags)
  check('note: created and updated show', /created/.test(one?.text ?? '') && /updated/.test(one?.text ?? ''), one?.text)
  check('note: rows carry icons', (one?.icons ?? 0) >= 3, one?.icons)

  // The chip's x takes the tag out of the words.
  await h.locator('[aria-label="Remove #zqtag"]').click()
  await wait(900)
  const words = await h.evaluate((sel) => document.querySelector(sel)?.closest('.tiptap.ProseMirror')?.textContent ?? '', strip)
  check('x on a tag takes it out of the words', !words.includes('#zqtag') && words.includes('#book'), words.slice(0, 80))
  const chips = await h.evaluate(() => [...document.querySelectorAll('[data-tag-chip]')].map((one) => one.getAttribute('data-tag-chip')))
  check('and its chip goes', !chips.includes('zqtag'), chips)

  // Folded shut and open again.
  await h.locator('[data-properties-head]').click()
  await wait(300)
  check('the block folds shut', (await h.locator(`${strip} [data-property="created"]`).count()) === 0)
  await h.locator('[data-properties-head]').click()
  await wait(300)
  check('and opens again', (await h.locator(`${strip} [data-property="created"]`).count()) === 1)

  // Name:: value moves into the block.
  await h.evaluate((sel) => {
    const page = document.querySelector(sel).closest('.tiptap.ProseMirror')
    const last = [...page.children].filter((el) => el.tagName === 'P').at(-1)
    page.focus()
    const range = document.createRange()
    range.selectNodeContents(last)
    range.collapse(false)
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  }, strip)
  await h.keyboard.press('Enter')
  await h.keyboard.type('Author:: Ursula Le Guin', { delay: 10 })
  await h.keyboard.press('Enter')
  await wait(900)
  check('Name:: value becomes a row in the block', /Author\s*Ursula Le Guin/.test((await h.locator(strip).textContent()) ?? ''))

  // An empty note: just "Add property".
  const bare = await h.evaluate((doc) => window.api.captures.create({ kind: 'note', body: doc }), { type: 'doc', content: [para('Bare title'), para('Nothing else here')] })
  await send('capture', bare)
  await wait(1500)
  const quiet = await h.evaluate((sel) => { const box = document.querySelector(sel); return box ? { head: !!box.querySelector('[data-properties-head]'), add: !!box.querySelector('[data-add-property]') } : null }, strip)
  check('empty note: only "Add property", no heading', !!quiet && !quiet.head && quiet.add, JSON.stringify(quiet))

  // An article: its title is its own box, so the block opens the words.
  const article = await v('article:new')
  await v('item:save', article, { title: 'An article with a title', body: { type: 'doc', content: [para('The first line of the body #book'), para('The second line')] } })
  await go('articles')
  await send('article', article)
  await wait(1800)
  const art = await shape()
  check('article: the block sits before the first line of the words', !!art && art.bottom <= art.first + 1, JSON.stringify(art))

  // 18. A group's icon opens the icon picker; the row does not fold.
  const ids = []
  for (const title of ['Group page one', 'Group page two']) { const one = await v('article:new'); await v('item:save', one, { title }); ids.push(one) }
  await v('groups:arrange', 'article', { top: ['g:qw2'], groups: { qw2: ids }, make: { id: 'qw2', name: 'Wave two group' } })
  // Groups show as rows in a plain list (not grouped by kind or date).
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'newest', group: 'none', filter: {}, density: 'list' })))
  await go('home')
  await wait(500)
  await go('articles')
  await wait(1500)
  const groupRow = h.locator('[data-group-row="qw2"]').first()
  await groupRow.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {})
  const wasOpen = await groupRow.getAttribute('aria-expanded').catch(() => null)
  const iconBox = await groupRow.locator('[data-group-icon]').boundingBox()
  await h.mouse.click(iconBox.x + iconBox.width / 2, iconBox.y + iconBox.height / 2)
  await wait(600)
  const picker = await h.evaluate(() => [...document.querySelectorAll('[data-slot="popover-content"]')].some((one) => one.getBoundingClientRect().height > 100))
  check('18. a click on a group\'s icon opens its icon picker', picker)
  check('18. and the group does not fold or unfold', (await groupRow.getAttribute('aria-expanded').catch(() => null)) === wasOpen, wasOpen)
  await h.keyboard.press('Escape')
  await wait(300)

  // 3. The sort menu says what each order does with groups, and offers Groups first.
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('f')
  await wait(700)
  const note = () => h.evaluate(() => document.querySelector('[data-sort-note]')?.textContent ?? null)
  const firstNote = await note()
  check('3. the sort menu says what the order does with groups', !!firstNote, firstNote)
  const groupsFirst = h.locator('[role="menuitemradio"]', { hasText: 'Groups first' })
  check('3. "Groups first" is offered', (await groupsFirst.count()) === 1)
  if (await groupsFirst.count()) {
    await groupsFirst.click()
    await wait(700)
    const said = await note()
    check('3. and says what it does', /Groups on top/.test(said ?? '') && said !== firstNote, said)
    await h.keyboard.press('Escape')
    await wait(500)
    const top = await h.evaluate(() => {
      const group = document.querySelector('[data-group-row]')?.getBoundingClientRect().top
      const rows = [...document.querySelectorAll('[data-sortable-id]')].filter((one) => !one.closest('aside') && !one.querySelector('[data-group-row]') && !one.closest('[data-group-box]'))
      return { group, row: rows[0]?.getBoundingClientRect().top }
    })
    check('3. Groups first puts the group on top', top.group !== undefined && (top.row === undefined || top.group <= top.row), JSON.stringify(top))
  }
  await h.keyboard.press('Escape')
  await wait(300)

  // 7. A tag in the sidebar drags into a new order, saved.
  const tagIds = () => h.evaluate(() => [...document.querySelectorAll('aside nav [data-side-tag]')].map((one) => one.getAttribute('data-side-tag')))
  const unfold = h.locator('aside nav [aria-label="Show your tags"]')
  if (await unfold.count()) (await unfold.click(), await wait(600))
  const before = await tagIds()
  if (before.length >= 3) {
    const at = (tag) => h.evaluate((tag) => { const r = document.querySelector(`aside nav [data-side-tag="${tag}"]`).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top } }, tag)
    const from = await at(before[2])
    const to = await at(before[0])
    await h.mouse.move(from.x, from.y)
    await h.mouse.down()
    await h.mouse.move(from.x, from.y - 8, { steps: 3 })
    await h.mouse.move(from.x, to.top + 2, { steps: 14 })
    await wait(200)
    await h.mouse.up()
    await wait(1000)
    const after = await tagIds()
    const saved = (await v('settings')).tagOrder ?? []
    check('7. a dragged tag takes its new place', after[0] === before[2], `${before.join(' ')} -> ${after.join(' ')}`)
    check('7. and the order is saved', saved[0] === before[2], saved.join(' '))
  } else check('7. the sidebar shows tags to drag', false, before.join(' '))

  // 8. Customize: a row goes into another block.
  await h.locator('aside nav [data-sortable-id="home"] button[data-side-row]').first().click({ button: 'right' })
  await wait(500)
  await h.locator('[role=menu] [role=menuitem]', { hasText: 'Customize the sidebar' }).first().click()
  await wait(1000)
  const parts = await h.evaluate(() => [...document.querySelectorAll('[data-show-part]')].map((part) => ({ key: part.getAttribute('data-show-part'), rows: [...part.querySelectorAll('[data-show-row]')].map((one) => one.getAttribute('data-show-row')) })))
  const gaps = await h.evaluate(() => [...document.querySelectorAll('[data-show-part] [data-side-gap]')].length)
  check('8. Customize shows the blocks with the sidebar\'s gap', parts.length >= 2 && gaps >= 1, JSON.stringify(parts))
  const write = parts.find((one) => one.key === 'Write')
  const other = parts.find((one) => one.key !== 'Write' && one.rows.length)
  if (write && other) {
    const id = write.rows[0]
    const rowAt = (id) => h.evaluate((id) => { const r = document.querySelector(`[data-show-row="${id}"]`).getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height / 2, bottom: r.bottom } }, id)
    const from = await rowAt(id)
    const to = await rowAt(other.rows[other.rows.length - 1])
    await h.mouse.move(from.x, from.y)
    await h.mouse.down()
    await h.mouse.move(from.x, from.y + 8, { steps: 3 })
    await h.mouse.move(from.x, to.bottom - 2, { steps: 16 })
    await wait(200)
    const line = await h.evaluate(() => document.querySelector('[data-drop-line]')?.getAttribute('data-drop-line') ?? null)
    await h.mouse.up()
    await wait(1000)
    const groupsSaved = (await v('settings')).sidebarGroups ?? {}
    check('8. while dragging in Customize, a line shows where it lands', !!line, line)
    check('8. a row dragged into another block in Customize joins it', groupsSaved[id] === other.key, `${id}: ${JSON.stringify(groupsSaved)}`)
  }
  await h.keyboard.press('Escape')
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close()
}
done()
