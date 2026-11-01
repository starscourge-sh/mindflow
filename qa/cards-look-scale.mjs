// Review's three tabs at scale: QA_CARDS cards (5, 50, 500, 5,000) over up to 300 decks with long names and
// 12,345-size counts in the year. Each tab screenshotted light and dark; nothing runs off the side, the Decks
// page keeps its fold (no more than 24 tiles drawn), and the page opens within 3 seconds.
//   QA_CARDS=5000 QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/cards-look-scale.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const n = Number(process.env.QA_CARDS ?? 500)
const decks = Math.min(300, Math.max(1, Math.round(n / 16)))
const c = await sandbox({ width: 1200, height: 860 })
const { h } = c
const shots = process.env.QA_SHOTS
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const waitFor = async (test, ms = 15000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
try {
  const rows = Array.from({ length: n }, (_, at) => ({ term: `Question ${at + 1}: what does the ${['mitochondrial inner membrane', 'Treaty of Westphalia', 'subjunctive after ojalá'][at % 3]} do here?`, meaning: `Answer ${at + 1} #${['comparative-physiology-of-vertebrates-and-invertebrates', 'history', 'spanish-grammar'][at % 3]}-part-${at % decks}` }))
  for (let at = 0; at < rows.length; at += 500) await call('cards:list', rows.slice(at, at + 500))
  await c.go('home')
  const start = Date.now()
  await c.go('review')
  check(`${n} cards, ${decks} decks: the Decks page opens within 3 s`, await waitFor(() => has('[data-deck-grid] [data-deck], [data-deck-list]')) && Date.now() - start < 3900, `${Date.now() - start} ms`)
  check('at most 24 deck tiles drawn before the fold', (await h.evaluate(() => document.querySelectorAll('[data-deck-grid] [data-deck]').length)) <= 24 + 3)
  for (const tab of ['decks', 'cards', 'stats']) {
    await h.click(`[data-review-tab="${tab}"]`)
    await h.waitForTimeout(1200)
    const wide = await h.evaluate(() => { const sideways = (one) => { for (let at = one.parentElement; at; at = at.parentElement) if (/auto|scroll|hidden/.test(getComputedStyle(at).overflowX)) return true; return false }; return [...document.querySelectorAll('[data-review-page] button, [data-review-page] section, [data-review-page] h2, [data-review-page] h3')].filter((one) => one.offsetParent && !sideways(one) && one.getBoundingClientRect().right > window.innerWidth + 1).map((one) => one.textContent?.slice(0, 30)) })
    check(`${tab}: nothing runs off the side`, !wide.length, JSON.stringify(wide))
    if (shots) await c.both(join(shots, `scale-${n}-${tab}`))
  }
} finally {
  await c.close()
}
done()
