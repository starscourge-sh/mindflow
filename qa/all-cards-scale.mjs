// All cards at two sizes: the user's real book (about 135 cards, 14 tags) and a
// shared-deck user's (5,000 cards, 300 tags). Pockets, Cards (shelves and the
// plain grid), an opened group, Flip through, the list and compact rows, light
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
const waitFor = async (test, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
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
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-list] :is([data-pick], [data-pocket])')))
  await h.mouse.move(5, 5)
}
const reopen = async (patch) => { await setView(patch); await c.go('home'); await open() }
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
  await reopen({ density: 'small', group: 'none', filter: {} })
  const decks = new Set((await call('cards:all')).map((one) => one.tags[0] ? `#${one.tags[0].split('-')[0]}` : 'No tag')).size
  await waitFor(() => h.evaluate((n) => document.querySelectorAll('[data-pocket]').length === n, decks))
  const pockets = await h.evaluate(() => document.querySelectorAll('[data-pocket]').length)
  check(`${size}: a pocket for each deck or tag`, pockets === decks, `${pockets} of ${decks}`)
  const chipRow = () => h.evaluate(() => { const row = [...document.querySelectorAll('[data-card-browser] [data-hover-quiet]')].find((one) => [...one.querySelectorAll('button')].some((b) => /^All \d/.test(b.getAttribute('aria-label') ?? ''))); return row ? { nowrap: getComputedStyle(row).flexWrap === 'nowrap', height: row.getBoundingClientRect().height } : null })
  check(`${size}: no tag chips over the pockets, which are the tags`, (await chipRow()) === null)
  check(`${size}: only the front card of a pocket shows words`, await h.evaluate(() => [...document.querySelectorAll('[data-pocket] .mf-fan.mf-poster:not([data-fan-front])')].every((one) => !(one.textContent ?? '').trim())))
  await shot(`scale-${size}-pockets`, () => open())
  await reopen({ density: 'grid', group: 'deck' })
  check(`${size}: the tag chips are one line that slides sideways`, await waitFor(async () => { const row = await chipRow(); return !!row && row.nowrap && row.height < 48 }))
  check(`${size}: a shelf's ledge covers no words`, await waitFor(() => h.evaluate(() => {
    const shelf = document.querySelector('[data-shelf]')
    const ledge = shelf?.querySelector('.mf-ledge')?.getBoundingClientRect()
    const feet = [...(shelf?.querySelectorAll('[data-card-face="front"] [data-card-stage]') ?? [])].map((one) => one.getBoundingClientRect())
    return !!ledge && feet.length > 0 && feet.every((foot) => foot.bottom <= ledge.top + 1)
  })))
  check(`${size}: Cards grouped stands each group on a shelf`, await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-shelf]').length > 3)))
  await shot(`scale-${size}-shelves`, () => open())
  const began = Date.now()
  await reopen({ density: 'grid', group: 'none' })
  const drew = await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-card-grid] [data-card-face="front"]').length > 3))
  check(`${size}: Cards ungrouped is a plain grid of cards`, drew, `${Date.now() - began} ms to draw`)
  check(`${size}: the figures vary, card to card`, await h.evaluate(() => new Set([...document.querySelectorAll('[data-card-grid] [data-figure]')].map((one) => one.getAttribute('data-figure'))).size >= 4))
  await shot(`scale-${size}-grid`, () => open())
  await reopen({ density: 'list', group: 'none' })
  await shot(`scale-${size}-list`, () => open())
  await reopen({ density: 'compact', group: 'deck' })
  await shot(`scale-${size}-compact`, () => open())
  // A pocket opened, then flipped through.
  const openFirst = async () => { await reopen({ density: 'small', group: 'none' }); await h.evaluate(() => document.querySelector('[data-pocket]')?.click()); await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-opened]'))) }
  await openFirst()
  check(`${size}: a pocket opens its group`, await waitFor(() => h.evaluate(() => !!document.querySelector('[data-card-opened] [data-card-grid]'))))
  await shot(`scale-${size}-opened`, openFirst)
  const flow = async () => { await openFirst(); await h.evaluate(() => [...document.querySelectorAll('[data-card-opened] button[aria-pressed]')].find((one) => /Flip through/.test(`${one.textContent} ${one.getAttribute('aria-label')}`))?.click()); await waitFor(() => h.evaluate(() => !!document.querySelector('[data-flip-through]'))) }
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
