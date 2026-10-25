// Writing pages and gems seen as a board, as an Inbox note is: "Board view"
// in the ··· menu and ⌥⌘B turn a page of headings over lists into columns,
// the list beside it folding to a rail; a page of bullets with bullets under
// them is a board too; a page with nothing to make one of says how instead,
// and nothing else changes; a card dragged to another column moves under that
// heading in the page itself.
//
//   npx electron-vite build --outDir out-b
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=$PWD/out-b/main/index.js HALIGTREE_QA_AWAY=1 node qa/board-pages.mjs
//
// SHOTS=dir saves a picture of a page as a board.
import { sandbox } from './sandbox-lib.mjs'

const s = await sandbox({ width: 1400, height: 860 })
const { h, v, send } = s
const wait = (ms = 300) => h.waitForTimeout(ms)
let pass = 0
let fail = 0
const check = (name, ok, said = '') => {
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !said ? '' : `: ${said}`}`)
}

const para = (words) => ({ type: 'paragraph', content: [{ type: 'text', text: words }] })
const head = (words) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: words }] })
const item = (words, ...under) => ({ type: 'listItem', content: [para(words), ...(under.length ? [list(...under)] : [])] })
const list = (...items) => ({ type: 'bulletList', content: items.map((one) => (typeof one === 'string' ? item(one) : one)) })
const doc = (...blocks) => ({ type: 'doc', content: blocks })
const page = async (title, body) => {
  const id = await v('article:new')
  await v('item:save', id, { title, body })
  return id
}
const lanes = () => h.evaluate(() => [...document.querySelectorAll('[data-board] section')].map((lane) => ({
  title: lane.querySelector('h3')?.textContent ?? '',
  cards: [...lane.querySelectorAll('[data-sortable-id^="card:"]')].map((card) => card.textContent.trim())
})))
const railed = () => h.evaluate(() => !!document.querySelector('.mf-rail'))
const toasts = () => h.evaluate(() => document.body.innerText)
const chooseBoard = async () => {
  await h.locator('[data-open] button[aria-label="More"]').first().click()
  await wait(300)
  await h.getByRole('menuitemcheckbox', { name: /Board view/ }).click()
  await wait(900)
}
const open = async (type, id) => {
  await send(type, id)
  await wait(1400)
}

try {
  // 1. A page of headings over lists, by the ··· menu, then back with ⌥⌘B.
  const headed = await page('Feature list', doc(head('Ideas'), list('a'), head('Building'), list('b'), head('Done'), list('c')))
  await open('article', headed)
  check('the page opens with its list beside it, not a rail', !(await railed()))
  await chooseBoard()
  const shown = await lanes()
  check('"Board view" shows 3 columns', shown.length === 3, JSON.stringify(shown))
  check('each column holds its card', JSON.stringify(shown) === JSON.stringify([{ title: 'Ideas', cards: ['a'] }, { title: 'Building', cards: ['b'] }, { title: 'Done', cards: ['c'] }]), JSON.stringify(shown))
  check('the list folded to a rail', await railed())
  check('the details stepped aside', !(await h.evaluate(() => !!document.querySelector('[data-open] button[aria-label="Details"]'))))
  if (process.env.SHOTS) await h.screenshot({ path: `${process.env.SHOTS}/board-page.png` })

  // 2. A card dragged to another column moves under that heading in the page.
  const from = h.locator('[data-board] section').nth(0).locator('[data-sortable-id^="card:"]').first()
  const to = h.locator('[data-board] section').nth(2).locator('[data-sortable-id^="card:"]').first()
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await h.mouse.move(a.x + 40, a.y + a.height / 2)
  await h.mouse.down()
  for (let i = 1; i <= 12; i++) await h.mouse.move(a.x + 40 + ((b.x - a.x) * i) / 12, a.y + a.height / 2 + ((b.y + b.height - a.y) * i) / 12)
  await wait(200)
  await h.mouse.up()
  await wait(1500)
  const after = await lanes()
  check('the card shows in the other column', after[2]?.cards.includes('a') && !after[0]?.cards.includes('a'), JSON.stringify(after))
  const body = (await v('item', headed)).body
  const saved = typeof body === 'string' ? JSON.parse(body) : body
  const words = (saved.content ?? []).filter((block) => block.content?.length).map((block) => (block.type === 'heading' ? `## ${block.content?.[0]?.text}` : (block.content ?? []).map((one) => `- ${one.content?.[0]?.content?.[0]?.text}`).join(' '))).join(' / ') || JSON.stringify(body).slice(0, 300)
  check('the page itself has the item under "Done"', /## Done \/ (- c - a|- a - c)$/.test(words) && /## Ideas \/ ## Building/.test(words), words)

  await h.keyboard.press('Alt+Meta+b')
  await wait(900)
  check('⌥⌘B turns it back into the page', !(await h.evaluate(() => !!document.querySelector('[data-board]'))))
  check('and the list is back', !(await railed()))

  // 3. Bullets with bullets under them are columns too.
  const nested = await page('Nested', doc(list(item('Ideas', 'one', 'two'), item('Doing', 'three'))))
  await open('article', nested)
  await chooseBoard()
  const columns = await lanes()
  check('a page of nested bullets shows as columns', JSON.stringify(columns) === JSON.stringify([{ title: 'Ideas', cards: ['one', 'two'] }, { title: 'Doing', cards: ['three'] }]), JSON.stringify(columns))
  // A card's #tag shows as the page draws it, and a link in it is a link.
  await v('item:save', nested, { body: doc(list(item('Ideas', 'one', 'two #probetag'), item('Doing', { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'site', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] }] }))) })
  await open('article', await page('Nested 2', (await v('item', nested)).body))
  await chooseBoard()
  const marks = await h.evaluate(() => ({ tag: !!document.querySelector('[data-board] [data-sortable-id^="card:"] .tiptap-token'), link: !!document.querySelector('[data-board] [data-sortable-id^="card:"] a[href="https://example.com"]') }))
  check('a #tag on a card shows as a tag', marks.tag, JSON.stringify(marks))
  check('a link on a card is a link', marks.link, JSON.stringify(marks))
  await h.keyboard.press('Alt+Meta+b')
  await wait(800)

  // 4. A flat list cannot be a board: it says how, and nothing else changes.
  const said = 'These bullets have no columns to go in'
  // The user's case: a page whose words are laid in without an edit, as a paste set in place is,
  // shaped as their Obsidian board: headings over checklists with lists inside, and the plugin's settings after.
  const pasted = await page('Pasted board', doc(para('')))
  await open('article', pasted)
  await h.evaluate(() => {
    const ed = [...document.querySelectorAll('[data-open] .ProseMirror')].map((el) => el.editor).find(Boolean)
    ed.commands.setContent('## 2026\n\n- [ ] Settle down\n- [ ] Projects\n    - [ ] Whip Sound App\n        - Just a whip\n\n## THIS MONTH\n\n- [ ] TUBE: 4 Vs #business\n\n%% kanban:settings\n%%', { contentType: 'markdown', emitUpdate: false })
  })
  await wait(400)
  await h.keyboard.press('Meta+Alt+KeyB')
  await wait(900)
  const fromPaste = await lanes()
  check('words laid in without an edit, shaped as an Obsidian board, make a board', fromPaste.length === 2 && fromPaste[0].title === '2026' && fromPaste[1].title === 'THIS MONTH', JSON.stringify(fromPaste))
  await h.keyboard.press('Meta+Alt+KeyB')
  await wait(600)
  // Headings with no bullets under them (the Sistine reading note): told what is missing, not to add headings.
  const unlisted = await page('Headings, no bullets', doc(head('One'), para('words'), head('Two'), para('more')))
  await open('article', unlisted)
  await chooseBoard()
  check('headings with no bullets are told what is missing', /2 headings are ready to be columns, but no bullets sit under them/.test(await toasts()), (await toasts()).slice(-300))
  await h.evaluate(() => window.dispatchEvent(new CustomEvent('haligtree:untoast')))
  const flat = await page('Flat', doc(list('x', 'y', 'z')))
  await open('article', flat)
  const before = (await v('item', flat)).body
  await chooseBoard()
  check('"Board view" on a flat list says how', (await toasts()).includes(said))
  check('and shows no board', !(await h.evaluate(() => !!document.querySelector('[data-board]'))))
  check('nor folds the list', !(await railed()))
  check('nor changes the page', JSON.stringify((await v('item', flat)).body) === JSON.stringify(before))

  // 5. The same for a gem, by ⌥⌘B and by the menu.
  const capture = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph' }] } }))
  await h.evaluate((id) => window.api.captures.save(id, { body: { type: 'doc', content: [{ type: 'bulletList', content: ['p', 'q'].map((one) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: one }] }] })) }] } }), capture)
  const gem = await v('promote', capture)
  await open('nugget', gem)
  await wait(4500)
  await h.locator('[data-open] .tiptap').first().click()
  await h.keyboard.press('Alt+Meta+b')
  await wait(700)
  check('⌥⌘B on a flat gem says how', (await toasts()).includes(said))
  check('and shows no board', !(await h.evaluate(() => !!document.querySelector('[data-board]'))))
  await h.keyboard.press('Escape')
  await chooseBoard()
  check('"Board view" is in a gem\'s ··· menu and gives no board for it', !(await h.evaluate(() => !!document.querySelector('[data-board]'))))
  const headedCapture = await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph' }] } }))
  await h.evaluate(([id, body]) => window.api.captures.save(id, { body }), [headedCapture, doc(head('Ideas'), list('g1'), head('Done'), list('g2'))])
  const headedGem = await v('promote', headedCapture)
  await open('nugget', headedGem)
  await wait(1500)
  await chooseBoard()
  const gemLanes = await lanes()
  check('a gem of headings shows as a board', gemLanes.length === 2 && gemLanes[0].cards[0] === 'g1', JSON.stringify(gemLanes))
  check('its list folded to a rail', await railed())
  await h.keyboard.press('Alt+Meta+b')
  await wait(700)

  check('no errors on the page', s.errors.length === 0, s.errors.join(' | '))
} catch (error) {
  fail++
  console.log('FAIL', error.message.split('\n')[0])
} finally {
  console.log(`\n${pass} passed, ${fail} failed`)
  await s.close()
  process.exit(fail ? 1 : 0)
}
