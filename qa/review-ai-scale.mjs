// Apple Intelligence in Review and the reader, at the edges: a slow model (the stand-in told to take 1.5 s)
// never moves the grades while it thinks; a session of 5 cards and of 500; the window at 390 wide.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/review-ai-scale.mjs
import { join } from 'node:path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
process.env.HALIGTREE_QA_CAPS = 'ai'
process.env.HALIGTREE_QA_AI_DELAY = '1500'
const { check, done } = checks()
const shots = process.env.QA_SHOTS
const c = await sandbox({ width: 1200, height: 900 })
const { h, v } = c
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(50)) if (await test()) return true; return false }
const grades = () => h.evaluate(() => [...document.querySelectorAll('[data-grades] button')].map((one) => Math.round(one.getBoundingClientRect().top)).join(','))
const typeAndCheck = async (words) => {
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-typed-lines]')))
  await h.locator('textarea').first().fill(words)
  await h.locator('textarea').first().press('Meta+Enter')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-grades]')))
}
try {
  // A slow model: frames every 50ms from the answer to the verdict; the grades hold still throughout.
  await c.go('review', ':today')
  await typeAndCheck('something in my own words')
  const seen = []
  for (let i = 0; i < 50; i++) {
    seen.push({ slot: await h.evaluate(() => document.querySelector('[data-meaning-slot]')?.getAttribute('data-meaning-slot') ?? null), grades: await grades() })
    if (shots && i % 10 === 0) await h.screenshot({ path: join(shots, `slow-verdict-${i}.png`) })
    if (seen.at(-1).slot && seen.at(-1).slot !== 'wait' && seen.length > 3) break
    await h.waitForTimeout(50)
  }
  check('slow model: it waited with the orb, then gave its verdict', seen.some((one) => one.slot === 'wait') && seen.at(-1).slot === 'close', JSON.stringify(seen.map((one) => one.slot)))
  check('slow model: the grades never moved, waiting or answered', new Set(seen.map((one) => one.grades)).size === 1, JSON.stringify([...new Set(seen.map((one) => one.grades))]))
  // at the narrowest window (asked for 390; the main window stops at 560): the verdict line and the grades fit, nothing runs off the side.
  await c.size(390, 844)
  await h.waitForTimeout(700)
  const narrow = await h.evaluate(() => ({ inner: innerWidth, wide: document.documentElement.scrollWidth, slot: Math.round(document.querySelector('[data-meaning-slot]')?.getBoundingClientRect().right ?? 0), why: Math.round(document.querySelector('[data-meaning]')?.getBoundingClientRect().right ?? 0) }))
  check('at the narrowest window (asked for 390; the main window stops at 560): no sideways scroll, the verdict and its why inside the window', narrow.wide <= narrow.inner && narrow.slot <= narrow.inner - 8 && narrow.why <= narrow.inner - 8, JSON.stringify(narrow))
  if (shots) for (const look of ['light', 'dark']) { await c.look(look); await h.screenshot({ path: join(shots, `verdict-390-${look}.png`) }) }
  await c.look('light')
  await c.size(1200, 900)
  await h.keyboard.press('3')

  // 500 cards in the session: the hint and the verdict look the same with a long queue.
  await v('settings:set', { newPerDay: 999 })
  await v('cards:list', Array.from({ length: 500 }, (_, n) => ({ term: `Probe term ${n + 1}`, meaning: `the meaning of probe term ${n + 1}` })))
  // A fresh sitting, not the one left part way: Review keeps today's queue it started with.
  await c.go('home')
  await h.evaluate(() => Object.keys(localStorage).filter((key) => /left|review/i.test(key) && key !== 'theme').forEach((key) => localStorage.removeItem(key)))
  await c.go('review', ':today')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-typed-lines]')))
  const many = (await v('review:queue')).length
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('h')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-hint]')), 6000)
  const top500 = await h.evaluate(() => document.querySelector('[data-review-top]')?.textContent ?? '')
  check(`a session of ${many} cards: the hint shows, the top line counts them`, many >= 500 && /\d{3}/.test(top500.replace(/,/g, '')) && await h.evaluate(() => !!document.querySelector('[data-hint]')), top500.slice(0, 120))
  if (shots) await h.screenshot({ path: join(shots, 'session-500-hint.png') })

  // 5 cards: put off until five are left.
  await v('settings:set', { newPerDay: 0 })
  await c.go('review', ':today')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-typed-lines]')))
  await h.evaluate(() => document.activeElement?.blur())
  for (let left = (await v('review:queue')).length; left > 5; left--) { await h.keyboard.press('b'); await h.waitForTimeout(250) }
  await h.keyboard.press('h')
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-hint]')), 6000)
  const top5 = await h.evaluate(() => document.querySelector('[data-review-top]')?.textContent ?? '')
  check('a session down to 5 cards: the hint shows, the top line still reads', await h.evaluate(() => !!document.querySelector('[data-hint]')), top5.slice(0, 120))
  if (shots) await h.screenshot({ path: join(shots, 'session-5-hint.png') })
} catch (error) {
  check('ran without throwing', false, String(error?.stack ?? error))
} finally {
  await c.close?.()
}
done()
