// Reading's rows of your own notes: "More from" a source with its face and
// three or more cards; a heart in the Feed brings "Because you liked" with
// notes sharing its tags and never the liked one; "Show all" opens the source
// page; a card opens its note; the row scrolls sideways with a › button while
// there is more; a note made private leaves; the same rows after a reload.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/feed-rows'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1600, height: 1000 })
const { h, v, go, errors, close } = s
const paint = (name) => h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); document.documentElement.classList.toggle('dark', n === 'dark') }, name)
const toReading = async () => {
  await go('feed')
  await h.waitForTimeout(900)
  await h.click('[data-tabs="feed"] [data-tab="reading"]')
  await h.waitForTimeout(1200)
}
try {
  const first = await v('feed:reading')
  const more = first.shelves.find((one) => one.kind === 'source')
  check('a "More from" row with 3 or more cards', more && more.cards.length >= 3, JSON.stringify(first.shelves.map((one) => [one.kind, one.name, one.cards.length])))

  // A card of theirs made private leaves the row at once.
  const secret = more?.cards.at(-1)
  if (secret) await v('private', secret.type === 'capture' ? 'captures' : 'nuggets', secret.id, true)
  const after = await v('feed:reading')
  const mored = after.shelves.find((one) => one.kind === 'source')
  check('the same source all day', mored?.name === more?.name, mored?.name)
  check('a note made private leaves the row', !after.shelves.some((one) => one.cards.some((card) => card.id === secret?.id)), secret?.id)

  // A heart in the Feed's Notes: on a post with tags.
  await go('feed')
  await h.waitForTimeout(1200)
  const feed = await v('feed')
  const post = feed.posts.find((one) => one.type === 'nugget' && one.tags.length && one.kind !== 'quote') ?? feed.posts.find((one) => one.tags.length)
  check('a Feed post with tags to heart', !!post, String(feed.posts.length))
  const node = h.locator(`[data-feed-id="${post.id}"]`)
  await node.scrollIntoViewIfNeeded()
  await node.locator('[data-feed-reaction="like"]').click()
  await h.waitForTimeout(800)

  await h.click('[data-tabs="feed"] [data-tab="reading"]')
  await h.waitForTimeout(1200)
  const shelves = await h.locator('[data-reading-shelf]').evaluateAll((all) => all.map((one) => ({ kind: one.getAttribute('data-reading-shelf'), name: one.getAttribute('data-shelf-name'), cards: [...one.querySelectorAll('[data-shelf-card]')].map((card) => card.getAttribute('data-shelf-card')), face: !!one.querySelector('[data-shelf-face] [data-avatar]') })))
  const source = shelves.find((one) => one.kind === 'source')
  check('Reading shows "More from" with 3+ cards', source && source.cards.length >= 3, JSON.stringify(shelves.map((one) => [one.kind, one.name, one.cards.length])))
  check("the row wears the source's face", !!source?.face)
  check('"More from" sits under Today\'s read and over the list', await h.evaluate(() => {
    const today = document.querySelector('[data-reading-today]')
    const rows = document.querySelector('[data-reading-shelves]')
    const list = document.querySelector('ol [data-reading-row]')
    return !!(today && rows && list && today.compareDocumentPosition(rows) & 4 && rows.compareDocumentPosition(list) & 4)
  }))
  const liked = shelves.find((one) => one.kind === 'liked')
  check('a "Because you liked" row appears after the heart', !!liked && liked.cards.length >= 3, JSON.stringify(liked))
  check('the liked note is not on its own row', liked && !liked.cards.includes(post.id))
  const data = (await v('feed:reading')).shelves.find((one) => one.kind === 'liked')
  const tags = new Set(post.tags)
  const all = await v('feed')
  check('it is named for the liked note', data?.of.id === post.id, data?.name)
  check('its cards share a tag with it', !!data && tags.has(data.tag), `${data?.tag} in ${[...tags]}`)
  check('no private note on any row', !shelves.some((one) => one.cards.includes(secret?.id)))
  check('two rows or more with real content', shelves.filter((one) => one.cards.length >= 3).length >= 2, String(shelves.length))
  void all

  // Sideways: the › shows while there is more, and moves the row along.
  const row = h.locator('[data-reading-shelf="source"] [data-shelf-row]')
  const next = h.locator('[data-reading-shelf="source"] [data-shelf-along="next"]')
  const wide = await row.evaluate((one) => one.scrollWidth > one.clientWidth + 2)
  check('the row has more than fits', wide)
  check('the › button shows when there is more', (await next.evaluate((one) => getComputedStyle(one).opacity)) === '1')
  check('the ‹ button is hidden at the start', (await h.locator('[data-reading-shelf="source"] [data-shelf-along="back"]').evaluate((one) => getComputedStyle(one).opacity)) === '0')
  await h.locator('[data-reading-shelves]').evaluate((one) => one.scrollIntoView({ block: 'start' }))
  for (const name of ['light', 'dark']) {
    await paint(name)
    await h.waitForTimeout(600)
    await h.screenshot({ path: `${SHOTS}/reading-rows-${name}.png` })
  }
  await paint('light')
  await next.click()
  await h.waitForTimeout(700)
  check('› moves the row along', (await row.evaluate((one) => one.scrollLeft)) > 100)
  check('the ‹ shows once moved', (await h.locator('[data-reading-shelf="source"] [data-shelf-along="back"]').evaluate((one) => getComputedStyle(one).opacity)) === '1')
  // A trackpad's sideways swipe moves it too.
  await row.evaluate((one) => one.scrollTo({ left: 0 }))
  await row.hover()
  await h.mouse.wheel(240, 0)
  await h.waitForTimeout(500)
  check('a sideways swipe scrolls the row', (await row.evaluate((one) => one.scrollLeft)) > 50)

  // The same rows after a reload today.
  const before = JSON.stringify(shelves.map((one) => [one.kind, one.name]))
  await h.reload()
  await h.waitForTimeout(2000)
  await toReading()
  const again = JSON.stringify(await h.locator('[data-reading-shelf]').evaluateAll((all) => all.map((one) => [one.getAttribute('data-reading-shelf'), one.getAttribute('data-shelf-name')])))
  check('the same rows after a reload', before === again, `${before} / ${again}`)

  // Show all opens the source page.
  await h.click('[data-reading-shelf="source"] [data-shelf-all]')
  await h.waitForTimeout(1200)
  check('"Show all" opens the source page', await h.locator('[data-source-page]').isVisible().catch(() => false) && (await h.locator('[data-source-page]').innerText()).includes(source.name))

  // A card opens its note.
  await toReading()
  const card = h.locator('[data-reading-shelf="source"] [data-shelf-card]').first()
  await card.click()
  await h.waitForTimeout(1200)
  check('a card opens its note', await h.locator('.ProseMirror').first().isVisible().catch(() => false) && !(await h.locator('[data-reading-shelves]').isVisible().catch(() => false)))
  check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await close()
}
done()
