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
  // Pointing at a bar: the others dim, its value follows the pointer and takes the point's place.
  const bars = '[data-mono-card="minutes"] [data-bar]'
  await h.locator(bars).last().scrollIntoViewIfNeeded()
  const frames = shots ? join(shots, 'hover') : null
  for (const [at, x] of [[0, 0.2], [1, 0.5], [2, 0.9]]) {
    const box = await h.locator('[data-mono-card="minutes"] [data-focus-bars]').boundingBox()
    await h.mouse.move(box.x + box.width * x, box.y + box.height * 0.6, { steps: 6 })
    await h.waitForTimeout(450)
    if (frames) await h.locator('[data-mono-card="minutes"]').screenshot({ path: `${frames}-${at}.png` })
  }
  const hover = await h.evaluate((bars) => {
    const all = [...document.querySelectorAll(bars)]
    const on = Number(document.querySelector('[data-mono-card="minutes"] [data-focus-bars]').getAttribute('data-hovered'))
    return { on, mine: Number(getComputedStyle(all[on]).opacity), others: Math.max(...all.filter((_, at) => at !== on).map((one) => Number(getComputedStyle(one).opacity))), tip: document.querySelector('[data-mono-card="minutes"] [data-mono-tip]')?.textContent, point: document.querySelector('[data-mono-card="minutes"] [data-mono-point]')?.textContent, said: all[on]?.getAttribute('data-say') }
  }, bars)
  check('pointing at a bar dims the others and shows its value', hover.mine === 1 && hover.others <= 0.4 && hover.tip === hover.said && hover.point === hover.said, JSON.stringify(hover))
  await h.mouse.move(5, 5)
  await h.waitForTimeout(300)
  // The switch: its pill slides to "7 days" and the bars glide to the last week.
  const pill = () => h.evaluate(() => { const one = document.querySelector('[data-mono-card="minutes"] [data-mono-switch] .bg-accent'); return one ? one.getBoundingClientRect().left : null })
  const width = () => h.evaluate((bars) => document.querySelector(bars)?.getBoundingClientRect().width ?? 0, bars)
  // Clicked and watched in the page itself, frame by frame, so a slow round trip cannot miss the glide.
  const run = await h.evaluate((bars) => new Promise((done) => {
    const pill = () => document.querySelector('[data-mono-card="minutes"] [data-mono-switch] .bg-accent')?.getBoundingClientRect().left ?? null
    const width = () => document.querySelector(bars)?.getBoundingClientRect().width ?? 0
    const seen = [{ pill: pill(), width: width() }]
    document.querySelector('[data-mono-card="minutes"] button[aria-label="7 days"]').click()
    const start = performance.now()
    const tick = () => { seen.push({ pill: pill(), width: width() }); if (performance.now() - start < 900) requestAnimationFrame(tick); else done(seen) }
    requestAnimationFrame(tick)
  }), bars)
  const count = await h.evaluate((bars) => document.querySelectorAll(bars).length, bars)
  const [pillFrom, pillTo, widthFrom, widthTo] = [run[0].pill, run.at(-1).pill, run[0].width, run.at(-1).width]
  const pillMid = run.map((one) => one.pill).find((at) => at !== null && Math.abs(at - pillFrom) > 1 && Math.abs(at - pillTo) > 1) ?? pillFrom
  const widthMid = run.map((one) => one.width).find((at) => at > widthFrom + 0.5 && at < widthTo - 0.5) ?? widthFrom
  check('the switch\'s pill slides to "7 days"', pillFrom !== null && pillTo !== pillFrom && Math.abs(pillMid - pillFrom) > 1 && Math.abs(pillMid - pillTo) > 1 && (pillMid - pillFrom) * (pillTo - pillMid) > 0, `${pillFrom} -> ${pillMid} -> ${pillTo}`)
  check('the bars morph to 7, widening on the way', count === 7 && widthMid > widthFrom + 0.5 && widthMid < widthTo - 0.5 && widthTo > widthFrom * 2, `${count} bars, ${widthFrom.toFixed(1)} -> ${widthMid.toFixed(1)} -> ${widthTo.toFixed(1)}`)
  // Watch for the dots in the page itself, and read them two frames after they first appear.
  const watchDots = () => h.evaluate(() => { window.__dots = null; const look = new MutationObserver(() => { const dots = [...document.querySelectorAll('[data-mono-card="reviews"] [data-mono-dots] > *')]; if (dots.length < 30) return; look.disconnect(); const frames = []; const start = performance.now(); const tick = () => { frames.push(dots.map((one) => Number(getComputedStyle(one).opacity))); if (performance.now() - start < 700) requestAnimationFrame(tick); else window.__dots = frames }; tick() }); look.observe(document.body, { childList: true, subtree: true }) })
  // The entry stagger: freshly drawn, the first day's dot is further in than the last's.
  await c.go('home')
  await watchDots()
  await c.go('stats')
  await waitFor(() => h.evaluate(() => !!window.__dots), 8000)
  const goal = await h.evaluate(() => { const dots = [...document.querySelectorAll('[data-mono-card="reviews"] [data-mono-dots] > *')]; const most = Math.max(1, ...dots.map((one) => Number(one.getAttribute('data-n')))); return dots.map((one) => { const n = Number(one.getAttribute('data-n')); return n === 0 ? 0.08 : 0.3 + 0.7 * Math.min(1, n / most) }) })
  // How far each dot is on its way in, 0 to 1.
  // The frame where the first dot is furthest ahead of the last, each as a share of its way in.
  const early = (await h.evaluate(() => window.__dots)).map((frame) => frame.map((one, at) => Math.round((one / goal[at]) * 100) / 100)).sort((a, b) => (b[0] - b[29]) - (a[0] - a[29]))[0]
  check('the dots fill in one after another', early?.length === 30 && early[0] > early[29] + 0.05, `first ${early[0]}, last ${early[29]}`)
  await h.emulateMedia({ reducedMotion: 'reduce' })
  await c.go('home')
  await watchDots()
  await c.go('stats')
  await waitFor(() => h.evaluate(() => !!window.__dots), 8000)
  const finals = await h.evaluate(() => [...document.querySelectorAll('[data-mono-card="reviews"] [data-mono-dots] > *')].map((one) => Number(one.getAttribute('data-n'))))
  const most = Math.max(1, ...finals)
  const still = (await h.evaluate(() => window.__dots))[0].map((one, at) => Math.abs(one - (finals[at] === 0 ? 0.08 : 0.3 + 0.7 * Math.min(1, finals[at] / most))) < 0.02 ? 1 : one)
  check('with reduced motion every dot is there at once', still.length === 30 && still.every((one) => one === 1), `first ${still[0]}, last ${still[29]}`)
  await h.emulateMedia({ reducedMotion: 'no-preference' })

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
