// The Feed's reactions, restack and thread: each reaction does what it says
// and is still chosen after a reload, the row's buttons never move, "Less of
// this" dims the post in place and Undo brings it back, a restack is a new
// gem linking to the old note that comes first in tomorrow's Feed (Undo
// takes it away), and a post opens on its own with its replies in date order,
// back returning to the same place in the list.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox, shiftClock } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/feed2'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, v, go, errors, theme, close, electron } = s
// Gems with no replies yet, so the counts below start from nothing (the sandbox's older gems carry years of them).
let fresh = []
const nth = (n) => h.locator(`[data-feed-id="${fresh[n]}"]`)
const boxes = (post) => post.locator('[data-feed-actions] > *').evaluateAll((all) => all.map((one) => { const r = one.getBoundingClientRect(); return `${Math.round(r.x)},${Math.round(r.width)}` }).join(' '))
const paint = (name) => h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); document.documentElement.classList.toggle('dark', n === 'dark') }, name)
// A reaction from the post's ⋯ menu: "Changed my mind" and "Use this" wait there.
const fromMenu = async (post, value) => { await post.locator('[data-feed-actions] [data-menu="post"]').click(); await h.waitForTimeout(300); await h.locator(`[role="menu"] [data-menu-item="${value}"]`).click() }
const reactionOf = async (id) => (await v('feed')).posts.find((one) => one.id === id)?.react ?? null
try {
  fresh = (await v('feed')).posts.filter((one) => one.type === 'nugget' && one.kind !== 'quote' && !one.replies && !one.restack).map((one) => one.id)
  await go('feed')
  await h.waitForTimeout(1200)
  const first = nth(0)
  const firstId = await first.getAttribute('data-feed-id')
  await first.scrollIntoViewIfNeeded()

  // Still true: chosen, its rhythm starts again from now, and the row holds still.
  const before = await boxes(first)
  const visitedBefore = (await v('items', 'nugget')).find((one) => one.id === firstId)?.lastVisitedAt ?? null
  await first.locator('[data-feed-reaction="true"]').click()
  await h.waitForTimeout(900)
  check('"Still true" shows as chosen', await first.locator('[data-feed-reaction="true"]').getAttribute('aria-pressed') === 'true')
  check('the action row does not move when a reaction is chosen', await boxes(first) === before, `${before} / ${await boxes(first)}`)
  check('"Still true" is marked on the post', (await first.locator('[data-feed-history]').innerText().catch(() => '')).includes('still true'))
  check('"Still true" is kept', await reactionOf(firstId) === 'true')
  void visitedBefore

  // Changing it: one a post a day.
  await fromMenu(first, 'changed')
  await h.waitForTimeout(700)
  check('"Changed my mind" opens Reply with the cursor in it', await h.evaluate(() => document.activeElement?.tagName === 'TEXTAREA' && !!document.activeElement.closest('[data-gloss]')))
  check('"Changed my mind" asks what you think now', (await h.evaluate(() => document.activeElement?.getAttribute('placeholder') ?? '')).includes('think now'))
  await h.keyboard.type('Not so sure any more', { delay: 10 })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(1000)
  check('one reaction a post: "Still true" is let go', await first.locator('[data-feed-reaction="true"]').getAttribute('aria-pressed') === 'false' && await reactionOf(firstId) === 'changed')
  check('the row is still where it was', await boxes(first) === before)

  // Use this: a link to it on today's Journal page.
  const second = nth(1)
  const secondId = await second.getAttribute('data-feed-id')
  await second.scrollIntoViewIfNeeded()
  await fromMenu(second, 'use')
  await h.waitForTimeout(900)
  const today = (await v('feed')).day
  const dayBody = JSON.stringify(await v('notes:day', today))
  check('"Use this" puts a link on today\'s Journal page', dayBody.includes(`nugget:${secondId}`), dayBody.slice(0, 120))
  await h.locator('button:has-text("Undo")').first().click()
  await h.waitForTimeout(900)
  const afterUndo = JSON.stringify(await v('notes:day', today))
  check('Undo takes the Journal link back out', !afterUndo.includes(`nugget:${secondId}`) && await reactionOf(secondId) === null)

  // Less of this: dims in place, Undo restores.
  const third = nth(2)
  const thirdId = await third.getAttribute('data-feed-id')
  await third.scrollIntoViewIfNeeded()
  const order = () => h.locator('[data-feed-post]').evaluateAll((all) => all.map((one) => one.dataset.feedId).join(','))
  const orderBefore = await order()
  const top = await third.evaluate((one) => one.getBoundingClientRect().top)
  await third.locator('[data-feed-reaction="less"]').click()
  await h.waitForTimeout(900)
  await h.mouse.move(5, 5)
  await h.waitForTimeout(500)
  const dim = Number(await third.evaluate((one) => getComputedStyle(one).opacity))
  check('"Less of this" dims the post', dim < 0.7, dim)
  check('it stays in its place in the list', await order() === orderBefore && Math.abs(await third.evaluate((one) => one.getBoundingClientRect().top) - top) < 2)
  await h.locator('button:has-text("Undo")').first().click().catch(() => {})
  await h.waitForTimeout(900)
  check('Undo brings it back to full', Number(await third.evaluate((one) => getComputedStyle(one).opacity)) > 0.95 && await reactionOf(thirdId) === null)
  await third.locator('[data-feed-reaction="less"]').click()
  await h.waitForTimeout(900)

  await h.reload()
  await h.waitForTimeout(2000)
  await go('feed')
  await h.waitForTimeout(1000)
  check('reactions are still chosen after a reload',
    await h.locator(`[data-feed-id="${firstId}"]`).getAttribute('data-feed-react') === 'changed' &&
    await h.locator(`[data-feed-id="${thirdId}"] [data-feed-reaction="less"]`).getAttribute('aria-pressed') === 'true')

  for (const name of ['light', 'dark']) {
    await theme(name)
    await go('feed')
    await h.waitForTimeout(500)
    await h.locator(`[data-feed-id="${firstId}"]`).scrollIntoViewIfNeeded()
    await h.waitForTimeout(300)
    await h.screenshot({ path: `${SHOTS}/reaction-${name}.png` })
  }

  // The thread: opened from the date, glosses oldest first, back to the same place.
  const host = h.locator(`[data-feed-id="${firstId}"]`)
  await host.locator('[data-feed-reply]').click()
  await h.waitForTimeout(300)
  await h.keyboard.type('A third thought', { delay: 10 })
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  await h.locator(`[data-feed-id="${thirdId}"]`).scrollIntoViewIfNeeded()
  const scrollBefore = await h.evaluate(() => { const at = [...document.querySelectorAll('*')].find((one) => one.contains(document.querySelector('[data-feed]')) && one.scrollHeight > one.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(one).overflowY)); return at?.scrollTop ?? -1 })
  await host.scrollIntoViewIfNeeded()
  const scrollAt = await h.evaluate(() => { const at = [...document.querySelectorAll('*')].find((one) => one.contains(document.querySelector('[data-feed]')) && one.scrollHeight > one.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(one).overflowY)); return at?.scrollTop ?? -1 })
  void scrollBefore
  // Where the post sits on screen: a picture above it that draws a beat later moves the scroll, never the post (scroll anchoring).
  const topAt = await host.evaluate((one) => Math.round(one.getBoundingClientRect().top))
  check('the post says its replies', /2 replies/.test(await host.locator('[data-feed-replies]').innerText().catch(() => '')), await host.locator('[data-feed-history]').innerText().catch(() => ''))
  await host.locator('[data-feed-date]').click()
  await h.waitForTimeout(900)
  check('the date opens the post on its own', await h.locator('[data-feed-thread]').count() === 1 && await h.locator('[data-feed-thread] [data-feed-post]').count() === 1)
  const dates = await h.locator('[data-feed-gloss-at]').evaluateAll((all) => all.map((one) => one.getAttribute('datetime')))
  check('its replies below it, oldest first', dates.length === 2 && dates[0] <= dates[1], dates.join(' / '))
  check('the reply box is at the foot', await h.locator('[data-feed-thread] > div:last-child [data-gloss]').count() === 1)
  for (const name of ['light', 'dark']) {
    await paint(name)

    await h.waitForTimeout(500)
    await h.screenshot({ path: `${SHOTS}/thread-${name}.png` })
  }
  await h.locator('[data-feed-back]').click()
  await h.waitForTimeout(700)
  const scrollBack = await h.evaluate(() => { const at = [...document.querySelectorAll('*')].find((one) => one.contains(document.querySelector('[data-feed]')) && one.scrollHeight > one.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(one).overflowY)); return at?.scrollTop ?? -1 })
  const topBack = await host.evaluate((one) => Math.round(one.getBoundingClientRect().top))
  check('back returns to the same place in the list', await h.locator('[data-feed-thread]').count() === 0 && Math.abs(topBack - topAt) < 4, `post at ${topAt} -> ${topBack}, scroll ${scrollAt} -> ${scrollBack}`)
  await host.locator('[data-feed-replies]').click()
  await h.waitForTimeout(700)
  check('"2 replies" opens the thread too', await h.locator('[data-feed-thread]').count() === 1)
  await h.keyboard.press('Escape')
  await h.waitForTimeout(600)
  check('Esc goes back', await h.locator('[data-feed-thread]').count() === 0, await h.evaluate(() => [...document.querySelectorAll('[role="dialog"], [role="menu"]')].map((one) => one.outerHTML.slice(0, 120)).join(' | ') + ' / ' + document.activeElement?.outerHTML.slice(0, 100)))

  // Restack: a composer in the post, the old note quoted, ⌘↵ saves a linked gem.
  const quoteId = await h.locator('[data-feed-kind="quote"]').first().getAttribute('data-feed-id')
  const quoteType = await h.locator('[data-feed-kind="quote"]').first().getAttribute('data-feed-post')
  const quotePost = h.locator(`[data-feed-id="${quoteId}"]`)
  await quotePost.scrollIntoViewIfNeeded()
  await quotePost.locator('[data-feed-restack]').click()
  await h.waitForTimeout(500)
  check('Restack opens a composer with the old note quoted', await quotePost.locator('[data-feed-composer] [data-feed-quoted]').count() === 1)
  await h.keyboard.type('This is why I keep reading', { delay: 10 })
  for (const name of ['light', 'dark']) {
    await paint(name)

    await h.waitForTimeout(500)
    await quotePost.locator('[data-feed-composer]').scrollIntoViewIfNeeded()
    await h.screenshot({ path: `${SHOTS}/restack-${name}.png` })
  }
  await quotePost.locator('[data-feed-composer] textarea').focus()
  await h.keyboard.press('Meta+Enter')
  await h.waitForTimeout(1000)
  const link = quoteType === 'capture' ? quoteId : `nugget:${quoteId}`
  const made = (await v('items', 'nugget')).filter((one) => (one.title ?? '').startsWith('This is why I keep reading'))
  const madeBody = made[0] ? JSON.stringify(await v('notes:body', 'nuggets', made[0].id).catch(() => null)) : ''
  check('⌘↵ saves a new gem linking to the old note', made.length === 1 && madeBody.includes(link), madeBody.slice(0, 160))
  check("it is not in today's set", !(await v('feed')).posts.some((one) => one.id === made[0]?.id))
  await h.locator('button:has-text("Undo")').first().click().catch(() => {})
  await h.waitForTimeout(900)
  check('Undo takes the restack away', !(await v('items', 'nugget')).some((one) => (one.title ?? '').startsWith('This is why I keep reading')))

  // Again, then tomorrow: it comes first, as "You restacked".
  await quotePost.locator('[data-feed-restack]').click()
  await h.waitForTimeout(400)
  await h.keyboard.type('Kept for tomorrow', { delay: 10 })
  await h.keyboard.press('Meta+Enter')
  await h.waitForTimeout(1000)
  const day = 24 * 60 * 60 * 1000
  await electron.evaluate((_, [code, by]) => new Function(`(${code})(${by})`)(), [shiftClock.toString(), day])
  await electron.context().addInitScript(`(${shiftClock.toString()})(${day})`)
  await h.reload()
  await h.waitForTimeout(2000)
  await go('feed')
  await h.waitForTimeout(1200)
  const top1 = h.locator('[data-feed-post]').first()
  check('tomorrow it comes first, as "You restacked"', (await top1.locator('[data-feed-context]').innerText().catch(() => '')).includes('You restacked') && (await top1.innerText()).includes('Kept for tomorrow'))
  check('with the old note quoted under it', await top1.locator('[data-feed-quoted]').count() === 1)

  check('no page errors', !errors.length, errors.join(' | '))
} catch (error) {
  check('ran to the end', false, error.message)
} finally {
  await close()
  done()
}
