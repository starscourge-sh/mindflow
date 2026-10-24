// The sandbox Feed as the launch video shows it: a thread of replies to
// yourself across three years, in date order with their years; a post from
// the archives and one from a year ago today in the day's set; a first
// screen with a quote card, a picture and a "replies over" line; and the side
// column (your sources, not heard from in a while, this week's tags) on a
// wide window only, a source's face opening its page.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/feed3'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1400, height: 900 })
const { h, v, go, errors, size, close } = s
const paint = (name) => h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); document.documentElement.classList.toggle('dark', n === 'dark') }, name)
try {
  const feed = await v('feed')
  const year = new Date().getFullYear()
  const multi = feed.posts.filter((one) => one.replies >= 3 && one.firstReply && new Date(one.firstReply).getFullYear() <= year - 2)
  check('a post has replies over three years', multi.length > 0, feed.posts.map((one) => `${one.replies}:${one.firstReply?.slice(0, 4)}`).join(' '))

  await go('feed')
  await h.waitForTimeout(1200)
  // The first screen.
  const firstScreen = await h.evaluate(() => {
    const bottom = window.innerHeight
    const on = (sel) => [...document.querySelectorAll(sel)].some((one) => { const r = one.getBoundingClientRect(); return r.height > 0 && r.top < bottom && r.bottom > 0 })
    return { quote: on('[data-feed-quote]'), picture: on('[data-feed-picture]'), replies: [...document.querySelectorAll('[data-feed-replies]')].some((one) => one.getBoundingClientRect().top < bottom && /over \d+ years/.test(one.textContent ?? '')), contexts: [...document.querySelectorAll('[data-feed-context]')].map((one) => one.textContent) }
  })
  check('the first screen has a quote card', firstScreen.quote)
  check('the first screen has a picture', firstScreen.picture)
  check('the first screen has a "replies over" line', firstScreen.replies)
  const contexts = await h.locator('[data-feed-context]').allInnerTexts()
  check('an archive post is in today\'s set', contexts.includes('From the archives'), contexts.join(' | '))
  check('a year-ago post is in today\'s set', contexts.some((one) => /ago today/.test(one)), contexts.join(' | '))

  // The side column at 1600 wide, gone at 1000.
  await size(1600, 1000)
  await h.waitForTimeout(600)
  check('the side column shows at 1600 wide', await h.locator('[data-feed-side]').isVisible())
  const cards = await h.locator('[data-feed-side] [data-feed-side-card]').evaluateAll((all) => all.map((one) => one.getAttribute('data-feed-side-card')))
  check('the side column shows its three cards at 1600 wide', cards.join() === 'sources,quiet,week', cards.join())
  const overlap = await h.evaluate(() => {
    const side = document.querySelector('[data-feed-side]')?.getBoundingClientRect()
    const post = document.querySelector('[data-feed-post]')?.getBoundingClientRect()
    return side && post ? side.left - post.right : null
  })
  check('the side column sits clear of the posts', overlap !== null && overlap >= 8, String(overlap))
  for (const name of ['light', 'dark']) {
    await paint(name)
    await h.waitForTimeout(500)
    await h.screenshot({ path: `${SHOTS}/first-screen-${name}.png` })
  }
  await paint('light')
  await size(1000, 700)
  await h.waitForTimeout(600)
  check('the side column is hidden at 1000 wide', await h.locator('[data-feed-side]').count() > 0 && !(await h.locator('[data-feed-side]').isVisible()))
  await size(1600, 1000)
  await h.waitForTimeout(600)

  // The thread across three years: in date order, each with its year.
  const id = multi[0]?.id
  const post = h.locator(`[data-feed-post][data-feed-id="${id}"]`)
  await post.locator('[data-feed-date]').click()
  await h.waitForTimeout(900)
  const dates = await h.locator('[data-feed-thread] [data-feed-gloss-at]').evaluateAll((all) => all.map((one) => ({ at: one.getAttribute('datetime'), said: one.textContent })))
  const years = new Set(dates.map((one) => one.at.slice(0, 4)))
  check('the thread has replies in three different years', years.size >= 3, [...years].join())
  check('the thread is in date order', dates.every((one, at) => !at || dates[at - 1].at <= one.at))
  check('every reply in it says its year', dates.every((one) => /\d{4}$/.test(one.said)), dates.map((one) => one.said).join(' | '))
  for (const name of ['light', 'dark']) {
    await paint(name)
    await h.waitForTimeout(500)
    await h.screenshot({ path: `${SHOTS}/thread-${name}.png` })
  }
  await paint('light')
  await h.keyboard.press('Escape')
  await h.waitForTimeout(700)

  // A face opens its source's page.
  const face = h.locator('[data-feed-face]').first()
  const name = await face.getAttribute('data-feed-face')
  await face.click()
  await h.waitForTimeout(1200)
  const opened = await h.evaluate(() => document.body.innerText)
  check('clicking a source opens its page', await h.locator('[data-feed-side]').count() === 0 && opened.includes(name), name)
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  await close()
}
done()
