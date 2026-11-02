// All cards at two sizes: the user's real book (about 135 cards, 14 tags) and a
// shared-deck user's (5,000 cards, 300 tags). The list first, Cards (grouped by
// deck under headings, and the plain grid), Flip through, the list and compact rows, light
// and dark, each screenshotted; and checks that each draws and answers its keys.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/all-cards-scale.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1280, height: 860 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 60000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const SUBJECTS = ['law', 'psychology', 'physics', 'history', 'art', 'maths', 'biology', 'spanish', 'film', 'philosophy', 'chemistry', 'music', 'economics', 'astronomy']
const QUESTIONS = ['What does “{w}” mean?', 'Who first described {w}?', 'Why does {w} matter in {s}?', 'When was {w} established?', 'How does {w} differ from its rival idea?']
const WORDS = ['Sovereignty', 'Cognitive load', 'Entropy', 'The Magna Carta', 'Chiaroscuro', 'The dot product', 'Mitosis', 'El subjuntivo', 'Montage', 'Utilitarianism', 'Covalent bonds', 'Counterpoint', 'Opportunity cost', 'Parallax']
const picture = (hue) => `![](data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='300' height='180'><rect width='300' height='180' fill='hsl(${hue},45%,62%)'/><circle cx='210' cy='70' r='48' fill='hsl(${hue},55%,82%)'/><path d='M0 150 L90 80 L160 130 L220 95 L300 150 L300 180 L0 180Z' fill='hsl(${hue},40%,35%)'/></svg>`).replace(/\(/g, '%28').replace(/\)/g, '%29')})`
const make = (count, tags, from = 0) => Array.from({ length: count }, (_, at) => {
  const n = at + from
  const s = tags[n % tags.length]
  const w = WORDS[n % WORDS.length]
  return { term: QUESTIONS[n % QUESTIONS.length].replace('{w}', w).replace('{s}', s.split('-')[0]), meaning: `${n % 11 === 0 ? picture((n * 37) % 360) + ' ' : ''}A short answer about ${w.toLowerCase()} (${n}) #${s}` }
})
const setView = (patch) => h.evaluate((patch) => {
  const was = JSON.parse(localStorage.getItem('view:cards') ?? '{"sort":"due","group":"none","filter":{}}')
  localStorage.setItem('view:cards', JSON.stringify({ ...was, ...patch }))
}, patch)
const open = async () => {
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"]')?.click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-list] [data-pick]')))
  await h.mouse.move(5, 5)
}
// The page read again from scratch, then waited for until it shows the view asked for: on a busy machine a
// trip to Home and back can land before the list has let go, leaving the last view on screen.
const reopen = async (patch) => {
  const began = Date.now()
  await setView(patch)
  await h.reload()
  await h.waitForLoadState('domcontentloaded')
  await open()
  const shows = await waitFor(() => h.evaluate((want) => { const page = document.querySelector('[data-card-browser]'); return !!page && (!want.density || page.getAttribute('data-density') === want.density) && (!want.group || page.getAttribute('data-group') === want.group) }, patch))
  console.log(`TIMING ${JSON.stringify(patch)} ${Date.now() - began} ms${shows ? '' : ' (the view asked for never showed)'}`)
}
const shot = async (name, again) => {
  if (!shots) return
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await again()
    await h.waitForTimeout(700)
    await h.screenshot({ path: join(shots, `${name}-${said}.png`) })
  }
  await c.theme('paper')
  await again()
}
const views = async (size) => {
  // Opened as anyone first finds it: a list of the cards, one row a card, never a stack.
  await h.evaluate(() => localStorage.removeItem('view:cards'))
  await h.reload()
  await h.waitForLoadState('domcontentloaded')
  await open()
  check(`${size}: All cards opens as a list of the cards, no stack`, await waitFor(() => h.evaluate(() => document.querySelector('[data-card-browser]')?.getAttribute('data-density') === 'list' && !document.querySelector('[data-card-browser] :is([data-pocket], .mf-pile)'))))
  const chipRow = () => h.evaluate(() => { const row = [...document.querySelectorAll('[data-card-browser] [data-hover-quiet]')].find((one) => [...one.querySelectorAll('button')].some((b) => /^All \d/.test(b.getAttribute('aria-label') ?? ''))); return row ? { nowrap: getComputedStyle(row).flexWrap === 'nowrap', height: row.getBoundingClientRect().height } : null })
  await reopen({ density: 'grid', group: 'deck' })
  check(`${size}: the deck chips are one line that slides sideways`, await waitFor(async () => { const row = await chipRow(); return !!row && row.nowrap && row.height < 48 }))
  const decks = new Set((await call('cards:all')).map((one) => one.tags[0] ? one.tags[0].split('-')[0] : '')).size
  check(`${size}: Cards grouped by deck: a heading a deck, single card faces under it, no stack`, await waitFor(() => h.evaluate((n) => document.querySelectorAll('[data-card-list] [data-island-head]').length >= Math.min(n, 3) && document.querySelectorAll('[data-card-list] [data-card-face="front"]').length > 0 && !document.querySelector('[data-card-browser] :is([data-pocket], .mf-pile, [data-shelf])'), decks)))
  await shot(`scale-${size}-grouped`, () => open())
  // Waited for by its own signal (the first run of cards drawn), then timed from the page's own marks.
  await h.evaluate(() => performance.clearMarks())
  await reopen({ density: 'grid', group: 'none' })
  const drew = await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-grid] [data-card-run="drawn"] [data-card-face="front"]')))
  const marks = await h.evaluate(() => { const at = (name) => performance.getEntriesByName(name).at(-1)?.startTime ?? null; const [asked, came, drawn] = ['cards:asked', 'cards:came', 'cards:first-run'].map(at); return { fetch: came && asked ? Math.round(came - asked) : null, draw: drawn && came ? Math.round(drawn - came) : null } })
  const load = (await import('os')).loadavg()[0].toFixed(1)
  console.log(`TIMING ${size} grid: cards came in ${marks.fetch} ms, first run drawn ${marks.draw} ms after, load ${load}`)
  check(`${size}: Cards ungrouped is a plain grid of cards`, drew, drew ? `cards came in ${marks.fetch} ms, drawn ${marks.draw} ms after (load ${load})` : await h.evaluate(() => `on screen: ${document.querySelector('[data-card-browser]')?.getAttribute('data-density')} ${document.querySelectorAll('[data-card-run]').length} runs, ${document.querySelectorAll('[data-pick]').length} cards; ${document.body.innerText.slice(0, 200)}`))
  check(`${size}: the first screen of cards is drawn within a second of the cards coming`, (marks.draw ?? Infinity) < 1000, `${marks.draw} ms (load ${load})`)
  check(`${size}: the figures vary, card to card`, await h.evaluate(() => new Set([...document.querySelectorAll('[data-card-grid] [data-figure]')].map((one) => one.getAttribute('data-figure'))).size >= 4))
  await shot(`scale-${size}-grid`, () => open())
  await reopen({ density: 'list', group: 'none' })
  await shot(`scale-${size}-list`, () => open())
  await reopen({ density: 'compact', group: 'deck' })
  await shot(`scale-${size}-compact`, () => open())
  // The grid flipped through, one card at a time.
  const flow = async () => { await reopen({ density: 'grid', group: 'none' }); await h.evaluate(() => document.querySelector('[data-card-flow]')?.click()); await waitFor(() => h.evaluate(() => !!document.querySelector('[data-flip-at="0"]'))) }
  await flow()
  const centre = () => h.evaluate(() => document.querySelector('[data-flip-at="0"] [data-pick]')?.dataset.pick)
  const first = await centre()
  await h.keyboard.press('ArrowRight')
  check(`${size}: Flip through shows at most two a side`, await h.evaluate(() => [...document.querySelectorAll('[data-flip-at]')].filter((one) => getComputedStyle(one).visibility !== 'hidden').every((one) => Math.abs(Number(one.getAttribute('data-flip-at'))) <= 2)))
  check(`${size}: → brings the next card to the middle`, await waitFor(async () => (await centre()) && (await centre()) !== first))
  await h.keyboard.press(' ')
  check(`${size}: Space turns the middle card over`, await waitFor(() => h.evaluate(() => !!document.querySelector('[data-flip-at="0"] [data-turned]'))))
  await h.keyboard.press(' ')
  await shot(`scale-${size}-flip-through`, async () => { await flow(); await h.keyboard.press('ArrowRight') })
}
try {
  // The real book's size: 135 cards over 14 tags (the sandbox's own cards included).
  const have = (await call('cards:all')).length
  await call('cards:list', make(Math.max(0, 135 - have), SUBJECTS))
  check('135: seeded', (await call('cards:all')).length >= 135)
  await views('135')
  // Gems and Notes, the lists All cards should sit beside as one app.
  for (const [page, name] of [['nuggets', 'gems'], ['inbox', 'notes']]) await shot(`sibling-${name}`, async () => { await c.go(page); await h.waitForTimeout(400) })
  // A shared-deck user's: 5,000 cards over 300 tags.
  const tags = Array.from({ length: 300 }, (_, at) => `${SUBJECTS[at % SUBJECTS.length]}${at >= SUBJECTS.length ? `${Math.floor(at / SUBJECTS.length)}` : ''}`)
  const now = (await call('cards:all')).length
  for (let from = 0; from < 5000 - now; from += 1000) await call('cards:list', make(Math.min(1000, 5000 - now - from), tags, from))
  check('5000: seeded', (await call('cards:all')).length >= 5000, `${(await call('cards:all')).length}`)
  await views('5000')
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
