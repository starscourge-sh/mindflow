// Wikipedia-style hover cards: rest on a person's name or a note link for a
// half second and its card comes (name in bold, a few lines, a picture on the
// right); not before; gone on Esc. A quote's "Connected to: [[@…|…]]" in the
// Feed is a real link.
//
//   npx electron-vite build --outDir out-h
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-h/main/index.js HALIGTREE_QA_AWAY=1 node qa/hover-cards.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-hover-cards-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1300, height: 860 })
const { v, h, go } = c
const card = () => h.locator('[data-note-preview]')
const rest = async (locator) => {
  const box = await locator.boundingBox()
  await h.mouse.move(box.x - 30, box.y - 30)
  await h.mouse.move(box.x + 4, box.y + box.height / 2, { steps: 4 })
}

try {
  const posts = (await v('feed')).posts
  const quote = posts.find((one) => one.kind === 'quote' && one.who)
  const other = posts.find((one) => (one.type === 'nugget' || one.type === 'article') && one.id !== quote?.id)
  check('the Feed has a quote with a name, and another note', quote && other, `${quote?.who}, ${other?.title}`)
  // Its body the way an import keeps it: Markdown in a string, ending "Connected to: [[@type:id|Label]]".
  await v('item:save', quote.id, { body: `${quote.text}\n\nConnected to: [[@${other.type}:${other.id}|${other.title}]]` })
  // A picture for the person, as one set by hand.
  const avatar = await h.evaluate(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 8, height: 8 })
    canvas.getContext('2d').fillRect(0, 0, 8, 8)
    const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'))
    return window.api.saveImage('image/png', new Uint8Array(await blob.arrayBuffer()))
  })
  await v('people:set', quote.who, avatar)
  await h.reload()
  await h.waitForTimeout(1500)
  await go('feed')
  await h.waitForTimeout(800)
  const post = h.locator(`[data-feed-id="${quote.id}"]`)
  check('the quote is in the Feed', await post.count() === 1)
  const link = post.locator('[data-feed-link]')
  check('its "Connected to" label is a link', await link.count() === 1, await link.first().textContent().catch(() => ''))

  // A person's name.
  await rest(post.locator('[data-feed-account]'))
  await h.waitForTimeout(250)
  check('no card before the pause', await card().count() === 0)
  await h.waitForTimeout(700)
  check('a card after the pause', await card().count() === 1)
  check('it leads with the name', (await card().locator('[data-preview-title]').textContent().catch(() => '')) === quote.who)
  check('a few lines about them', ((await card().locator('[data-preview-text]').textContent().catch(() => '')) ?? '').length > 5, await card().locator('[data-preview-text]').textContent().catch(() => ''))
  check('their picture on the right', await card().locator('[data-preview-image]').count() === 1)
  const nameBox = await post.locator('[data-feed-account]').boundingBox()
  const cardBox = await card().boundingBox()
  check('the card does not cover the name', cardBox && (cardBox.y >= nameBox.y + nameBox.height || cardBox.y + cardBox.height <= nameBox.y))
  // Straight on to the next link: its card at once, no new wait.
  await h.mouse.move(5, nameBox.y)
  await h.waitForTimeout(300)
  check('off the name, the card goes', await card().count() === 0)
  await rest(link)
  await h.waitForTimeout(250)
  check('the next link swaps in at once', (await card().locator('[data-preview-title]').textContent().catch(() => '')) === other.title)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(200)
  check('Esc puts it away', await card().count() === 0)

  // The link opens its note.
  await h.mouse.move(5, 5)
  await h.waitForTimeout(400)
  await link.click()
  await h.waitForTimeout(1200)
  check('a click on the link opens its note', await h.evaluate((title) => document.body.innerText.includes(title) && !document.querySelector('[data-feed-id]'), other.title))
  console.log('errors:', c.errors?.slice?.(0, 5))
} catch (error) {
  console.log('FAIL  probe stopped:', error.message)
  results.push(false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed} of ${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
