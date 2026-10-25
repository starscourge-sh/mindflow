// The Feed: opened from ⌘K, about twenty of your own posts picked once a day
// (the same after a reload), quotes signed by their author, a picture post,
// never a private note, Reply keeps a thought under the post, and it ends.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/feed'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, v, go, errors, theme, close } = s
try {
  // One gem made private before the day's set is picked: it must never come up.
  const gems = (await v('items', 'nugget')).filter((one) => !one.archivedAt)
  const secret = gems.find((one) => !one.private)
  if (secret) await v('private', 'nuggets', secret.id, true)
  const privateIds = new Set([...gems.filter((one) => one.private).map((one) => one.id), secret?.id].filter(Boolean))

  await go('home')
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('Feed', { delay: 30 })
  await h.waitForTimeout(500)
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1500)
  check('⌘K "Feed" opens the Feed', await h.locator('[data-page="feed"] [data-feed]').count() === 1)

  const ids = () => h.locator('[data-feed-post]').evaluateAll((all) => all.map((one) => `${one.dataset.feedPost}:${one.dataset.feedId}`))
  const first = await ids()
  check('15 to 25 posts', first.length >= 15 && first.length <= 25, first.length)
  check('nothing twice', new Set(first).size === first.length)
  const kinds = await h.locator('[data-feed-post]').evaluateAll((all) => all.map((one) => one.dataset.feedKind === 'quote' ? 'quote' : one.dataset.feedPost))
  check('a mix of kinds', new Set(kinds).size >= 3, [...new Set(kinds)].join(', '))
  check('no private note', !first.some((key) => privateIds.has(key.slice(key.indexOf(':') + 1))), [...privateIds].length)

  const quote = h.locator('[data-feed-kind="quote"]').filter({ has: h.locator('[data-feed-author]') }).first()
  const author = await quote.locator('[data-feed-author]').innerText().catch(() => '')
  const account = await quote.locator('[data-feed-account]').innerText().catch(() => '')
  check('a quote card shows its author as the account', !!author && author === account, `${account} / ${author}`)
  check('a gem with no source is "You"', await h.locator('[data-feed-post="nugget"]:not([data-feed-kind="quote"]) [data-feed-account]').first().innerText().catch(() => '') === 'You')
  const picture = h.locator('[data-feed-picture] img').first()
  await picture.scrollIntoViewIfNeeded().catch(() => {})
  await h.waitForTimeout(800)
  const loaded = await picture.evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => false)
  check('a picture post shows its picture', loaded, await h.locator('[data-feed-picture]').count())

  // Reply: the gloss line opens under the post, and the thought shows there at once.
  const post = h.locator('[data-feed-post="nugget"]').first()
  await post.locator('[data-feed-reply]').click()
  await h.waitForTimeout(400)
  await h.keyboard.type('Still true a year on', { delay: 15 })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1200)
  check('Reply adds a gloss under the post', (await post.locator('[data-feed-hanging]').innerText().catch(() => '')).includes('Still true a year on'))

  const end = h.locator('[data-feed-end]')
  await end.scrollIntoViewIfNeeded()
  check('the end says "You\'re all caught up"', (await end.innerText()).includes("You're all caught up"))
  check('the end says when the next set comes', /A new set in \d+ (hour|minute)/.test(await end.innerText()), await end.innerText())

  await h.reload()
  await h.waitForTimeout(2000)
  await go('feed')
  await h.waitForTimeout(800)
  const again = await ids()
  check('the same set after a reload', JSON.stringify(again) === JSON.stringify(first), `${again.length} vs ${first.length}`)

  for (const name of ['light', 'dark']) {
    await theme(name)
    await go('feed')
    await h.waitForTimeout(800)
    await h.screenshot({ path: `${SHOTS}/feed-${name}.png` })
    await h.locator('[data-feed-kind="quote"]').first().scrollIntoViewIfNeeded()
    await h.waitForTimeout(400)
    await h.screenshot({ path: `${SHOTS}/feed-${name}-quote.png` })
    await h.locator('[data-feed-picture]').first().scrollIntoViewIfNeeded()
    await h.waitForTimeout(400)
    await h.screenshot({ path: `${SHOTS}/feed-${name}-picture.png` })
    await h.locator('[data-feed-end]').scrollIntoViewIfNeeded()
    await h.waitForTimeout(400)
    await h.screenshot({ path: `${SHOTS}/feed-${name}-end.png` })
  }
  // A quote has no title to press: the quote itself opens it.
  await go('feed')
  await h.waitForTimeout(1200)
  const quoteCard = h.locator('[data-feed-quote]').first()
  if (await quoteCard.count()) {
    await quoteCard.scrollIntoViewIfNeeded()
    await quoteCard.click({ position: { x: 40, y: 20 } })
    await h.waitForTimeout(1200)
    check('clicking a quote in the Feed opens it', await h.evaluate(() => !document.querySelector('[data-page="feed"]') || document.querySelectorAll('[data-pane]').length > 1 || !!document.querySelector('[data-note-open], .tiptap')), await h.evaluate(() => document.querySelector('[data-page]')?.getAttribute('data-page') ?? ''))
  } else check('a quote is in the Feed to try', false)
  check('no page errors', !errors.length, errors.join(' | '))
} catch (error) {
  check('ran to the end', false, error.message)
} finally {
  await close()
  done()
}
