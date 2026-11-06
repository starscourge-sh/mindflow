// The Goals road card reads in three seconds: one big number in the dots' own unit (weeks on a road of
// weeks), one line saying what a dot is, the marks named under their dots on the chart (no key under
// it), no "logged" count until something is logged, the first month carrying its year when the road
// reaches into another year, and the dots filling the card rather than its left half. At 5, 40, 200,
// 420 days and 5 years, light and dark.
//   SHOTS=/abs/dir QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/goal-road-card.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const SHOTS = process.env.SHOTS ?? process.env.QA_DATA
const key = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const c = await sandbox({ width: 1280, height: 800 })
const { electron, h, v, send, both } = c
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const make = async (title, target, from) => {
  const id = await v('goal:new', title, key(30), key(0))
  await sql('update nuggets set goal_at = ?, goal_from = ? where id = ?', key(target), key(from), id)
  return id
}
const card = () => h.evaluate(() => {
  const card = document.querySelector('[data-open] [data-road-card]')
  if (!card) return null
  const box = card.getBoundingClientRect()
  const svgs = [...card.querySelectorAll('svg')].map((one) => one.getBoundingClientRect())
  const grid = svgs.length ? Math.max(...svgs.map((one) => one.right)) - Math.min(...svgs.map((one) => one.left)) : 0
  const labels = [...card.querySelectorAll('[data-road-label]')].map((one) => one.getBoundingClientRect())
  return {
    by: card.getAttribute('data-road-by'),
    big: card.querySelector('[data-goal-left]')?.textContent ?? '',
    rule: card.querySelector('[data-road-rule]')?.textContent ?? '',
    pills: [...card.querySelectorAll('[data-road-pill]')].map((one) => one.textContent.trim()),
    key: card.querySelector('ul[aria-label="What the marks mean"]') ? 1 : 0,
    names: [...card.querySelectorAll('[data-road-label]')].map((one) => one.textContent.trim()),
    clash: labels.some((a, i) => labels.some((b, j) => i < j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)),
    inside: labels.every((one) => one.left >= box.left - 1 && one.right <= box.right + 1),
    months: [...card.querySelectorAll('[data-road-band] > div[aria-hidden] span')].map((one) => one.textContent),
    spare: Math.round(box.width - 32 - grid),
    width: Math.round(box.width)
  }
})
try {
  await v('settings:set', { sounds: false })
  for (const [name, days] of [['5 days', 5], ['40 days', 40], ['200 days', 200], ['420 days', 420], ['5 years', 1826]]) {
    const id = await make(`Goal ${name}`, days, -Math.round(days / 3))
    await send('goal', id)
    for (let i = 0; i < 20 && !(await h.evaluate((t) => document.querySelector('[data-open]')?.textContent?.includes(t), `Goal ${name}`)); i++) await h.waitForTimeout(250)
    await h.waitForTimeout(800)
    const r = await card()
    const weeks = r?.by === 'week'
    check(`${name}: the big number counts in the dots' unit`, !!r && (weeks ? /weeks?$/.test(r.big) : /days?$|^Today$/.test(r.big)), r?.big)
    check(`${name}: one line says what a dot is`, !!r && r.rule === `Each dot is a ${weeks ? 'week' : 'day'}, the solid ones gone`, r?.rule)
    check(`${name}: no "logged" count with nothing logged`, !!r && !r.pills.some((one) => /logged/.test(one)), r?.pills.join(' | '))
    check(`${name}: no key under the chart; the marks are named on it`, !!r && r.key === 0 && r.names.includes('The day'), r?.names.join(' | '))
    check(`${name}: names never touch and stay in the card`, !!r && !r.clash && r.inside, JSON.stringify(r))
    // The card is as wide as its road or its big number, whichever is wider: never a key twice the road's width.
    // A short road is small, as it should be (dots are never stretched to fill); from 200 days on, its dots set the card's width.
    if (days >= 200) check(`${name}: the dots fill the card, not half of it`, !!r && r.spare <= (r.width - 32) * 0.3, `${r?.spare}px spare of ${r?.width}`)
    if (weeks) check(`${name}: the first month carries its year`, !!r && /\d{4}$/.test(r.months[0] ?? ''), r?.months.join(' '))
    await both(`${SHOTS}/road-${days}`, h)
  }
  // Something logged: the count turns up, in the dots' unit.
  const id = await make('Logged goal', 420, -60)
  await v('clue', id, 'Did a long run')
  await send('goal', id)
  // Opened when its page shows its own title.
  for (let i = 0; i < 20 && !(await h.evaluate(() => document.querySelector('[data-open]')?.textContent?.includes('Logged goal'))); i++) await h.waitForTimeout(250)
  await h.waitForTimeout(800)
  const r = await card()
  check('logged: "1 of N weeks logged" shows once something is logged', !!r && r.pills.some((one) => /^1 of \d+ weeks logged$/.test(one)), r?.pills.join(' | '))
  await both(`${SHOTS}/road-logged`, h)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close?.()
}
done()
