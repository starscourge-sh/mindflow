// Stats' cards and "Your month": each Stats card shows the number the review log gives, a dot's hover
// says its day ("12 reviews, Tue 14 Oct"), Your month opens from Stats, steps through every card with
// → and ←, each big number the month's own, Share opens the card sheet with an image, and with reduced
// motion the numbers are there at once. Light and dark screenshots of Stats and three cards.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/your-month.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const shot = async (name, again) => {
  if (!shots) return
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await again()
    await h.waitForTimeout(900)
    await h.screenshot({ path: join(shots, `${name}-${said}.png`) })
  }
  await c.theme('paper')
}
const value = (card) => h.evaluate((card) => document.querySelector(`[data-mono-card="${card}"] [data-mono-value]`)?.getAttribute('data-mono-value'), card)
const openStats = async () => {
  await c.go('stats')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-mono-card="reviews"]')))
  await h.evaluate(() => document.querySelector('[data-mono-card="reviews"]').scrollIntoView({ block: 'start' }))
}
const openMonth = async () => {
  await c.go('stats')
  if (!(await waitFor(() => h.evaluate(() => [...document.querySelectorAll('button')].some((one) => one.getAttribute('aria-label') === 'Your month'))))) throw new Error(`no "Your month" chip: ${await h.evaluate(() => [...document.querySelectorAll('button,[role="tab"],[role="radio"]')].map((one) => one.textContent?.trim()).filter((one) => /month|glance/i.test(one ?? '')).join(' / ')) + ' url ' + await h.evaluate(() => document.querySelector('[data-mono-card]') ? 'stats' : 'other')}`)
  await h.evaluate(() => [...document.querySelectorAll('button')].find((one) => one.getAttribute('aria-label') === 'Your month').click())
  if (!(await waitFor(() => h.evaluate(() => !!document.querySelector('[data-your-month-open]'))))) throw new Error(`no "see it card by card": ${await h.evaluate(() => [...document.querySelectorAll('button')].map((one) => one.textContent?.trim()).filter(Boolean).slice(0, 40).join(' / '))}`)
  await h.evaluate(() => document.querySelector('[data-your-month-open]').click())
  return waitFor(() => h.evaluate(() => !!document.querySelector('[data-month-card]')))
}
const step = async (key) => { await h.keyboard.press(key); await h.waitForTimeout(500) }
try {
  const stats = await h.evaluate(() => window.api.haligtree('study:stats'))
  // A PDF read this month: the book card.
  await h.evaluate(() => window.api.haligtree('pdf:read', 'https://example.org/Meditations.pdf', 40, 120))
  await openStats()
  const reviews = stats.month.reduce((sum, one) => sum + one.reviews, 0)
  check('Reviews card: reviews in 30 days', await value('reviews') === String(reviews.toLocaleString()), `${await value('reviews')} vs ${reviews}`)
  const retention = stats.checked ? `${Math.round((stats.recalled / stats.checked) * 100)}%` : 'None yet'
  check('Remembered card: the share of cards seen before', await value('retention') === retention, `${await value('retention')} vs ${retention}`)
  check('Known card: cards known', await value('known') === stats.known.toLocaleString(), `${await value('known')} vs ${stats.known}`)
  check('Stages card: every card, split three ways', await value('stages') === stats.cards.toLocaleString() && stats.stages.new + stats.stages.learning + stats.stages.learnt === stats.cards, JSON.stringify(stats.stages))
  check('Due card: due in two weeks', await value('due') === stats.due.reduce((a, b) => a + b, 0).toLocaleString())
  // Hover: the dot for the busiest day says its count and its day.
  const busiest = [...stats.month].sort((a, b) => b.reviews - a.reviews)[0]
  const dot = await h.$(`[data-mono-card="reviews"] [data-day="${busiest.day}"]`)
  await dot.hover()
  await h.waitForTimeout(300)
  const said = await h.evaluate(() => document.querySelector('[data-mono-card="reviews"] [data-mono-point]').textContent)
  check('hovering a day says its reviews and date', new RegExp(`^${busiest.reviews} reviews?, \\w{3} \\d{1,2} \\w{3}$`).test(said), said)
  await h.mouse.move(5, 5)
  await shot('stats-mono', openStats)

  check('Your month opens from Stats', await openMonth())
  const recap = await h.evaluate(() => window.api.haligtree('recap', 'month'))
  const seen = []
  for (let at = 0; at < 14; at++) {
    const card = await h.evaluate(() => ({ id: document.querySelector('[data-your-month]')?.getAttribute('data-card'), n: document.querySelector('[data-month-number]')?.getAttribute('data-month-number'), line: document.querySelector('[data-month-line]')?.textContent }))
    if (seen.at(-1)?.id === card.id) break
    seen.push(card)
    await step('ArrowRight')
  }
  const by = Object.fromEntries(seen.map((one) => [one.id, one]))
  check('it steps through every card to the end', seen.length >= 6 && seen.at(-1).id === 'end', seen.map((one) => one.id).join(' '))
  check('book card: the PDF read most', /Meditations/.test(by.book?.line ?? ''), by.book?.line)
  check('reviews card: the month\'s reviews', by.reviews?.n === String(recap.reviews), `${by.reviews?.n} vs ${recap.reviews}`)
  check('days card: the days studied', by.days?.n === String(recap.reviewDays), `${by.days?.n} vs ${recap.reviewDays}`)
  check('new cards card: the month\'s new cards', by.new?.n === String(recap.study.newCards), `${by.new?.n} vs ${recap.study.newCards}`)
  check('no card scolds', !seen.some((one) => /streak|0-day|missed|failed/i.test(one.line ?? '')), seen.map((one) => one.line).join(' | '))
  await step('ArrowLeft')
  check('← steps back', await h.evaluate(() => document.querySelector('[data-your-month]').getAttribute('data-card')) === seen.at(-2).id)
  await step('ArrowRight')
  await h.evaluate(() => document.querySelector('[data-month-share]').click())
  check('Share opens the card sheet with an image', await waitFor(() => h.evaluate(() => { const canvas = document.querySelector('[data-card-canvas]'); return !!canvas && canvas.width > 0 && canvas.toDataURL('image/png').length > 2000 })))
  await h.keyboard.press('Escape')
  await h.waitForTimeout(300)
  await h.evaluate(() => document.querySelector('[data-month-done]').click())
  check('"Next month starts now" closes it', await waitFor(() => h.evaluate(() => !document.querySelector('[data-your-month]'))))

  // Reduced motion: the number is there at once.
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await openMonth()
  await h.waitForTimeout(60)
  const shown = await h.evaluate(() => document.querySelector('[data-month-number]')?.textContent)
  check('with reduced motion the number shows at once', shown === Number(recap.reviews).toLocaleString('en-GB'), `${shown} vs ${recap.reviews}`)
  await h.evaluate(() => document.querySelector('[data-month-done]') || document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
  await h.keyboard.press('Escape')
  await h.emulateMedia({ reducedMotion: 'no-preference' })
  for (const [index, name] of [[0, 'reviews'], [1, 'days'], [3, 'retention']]) {
    await shot(`your-month-${name}`, async () => { await openMonth(); await h.evaluate((index) => document.querySelector(`[data-your-month] [aria-label="Card ${index + 1}"]`).click(), index); await h.waitForTimeout(1600) })
    await h.keyboard.press('Escape')
  }
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
