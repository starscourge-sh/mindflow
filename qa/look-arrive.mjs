// ⌘K's "Look it up" guesses as Wikipedia's own search box does, and its answers arrive calmly (the user, 20 Nov 2026:
// "Thought you said wiki can autocomplete and guess?" and "nothing smooth or delightful about how results just pop in and
// consume space"). An everyday user types a word cut short, "serendipit", picks "Search Wikipedia" and gets Serendipity
// first (the wiki's title autocomplete, before pages that only use the word); words no page has offer the wiki's own
// "Did you mean", which a click takes. While a site is out its room is kept at a row's height, the answers open their room
// and fade in, and nothing above the section moves. A power user with "Look things up as I search" on types on: rows
// that stay are the same rows in the same place from one keystroke to the next, never blinking out while the next answer
// is out. With Motion off the answers are simply there. Frames every 50ms of the answers landing, light and dark, go to
// QA_SHOTS. The sites are a stand-in (qa/wiki-stand-in.mjs), each wiki search held 600ms so the wait is seen.
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=<folder> node qa/look-arrive.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { standIn } from './wiki-stand-in.mjs'
process.env.QA_ARGS ??= '--sandbox'
const site = await standIn()
process.env.HALIGTREE_QA_SITES = site.base

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 860 })
const { h, v, look } = c
const shots = process.env.QA_SHOTS
const wait = (ms) => h.waitForTimeout(ms)
const until = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(50)) if (await test()) return true; return false }
const open = async (words) => {
  await h.keyboard.press('Escape')
  await h.keyboard.press('Meta+k')
  await h.waitForSelector('[role="dialog"] input', { timeout: 5000 })
  await h.keyboard.type(words, { delay: 30 })
  await until(() => h.evaluate(() => !!document.querySelector('[data-look="wikipedia"]') || !!document.querySelector('[data-look-waiting]')))
}
const looks = () => h.evaluate(() => [...document.querySelectorAll('[data-look]')].map((one) => `${one.getAttribute('data-look')}:${one.getAttribute('data-look-kind')}:${one.querySelector('[data-look-title]')?.textContent}`))
/** Where everything above "Look it up" sits (the box, the chips, every result and island head of your own), and the section's own head. */
const above = () => h.evaluate(() => {
  const dialog = document.querySelector('[role="dialog"]')
  const section = dialog.querySelector('[data-island="Look it up"]') ?? dialog.querySelector('[data-look]')?.closest('[data-island]')
  const tops = [...dialog.querySelectorAll('input, [data-row], [data-island-head]')].filter((one) => !section?.contains(one) || one.matches('[data-island-head]')).map((one) => Math.round(one.getBoundingClientRect().top))
  return tops.join(',')
})
/** Frames as near 50ms apart as pictures allow, for `ms`, each with what stood above the section at that moment. */
const film = async (name, ms = 900) => {
  const seen = []
  for (let n = 0, start = Date.now(); Date.now() - start < ms; n++) {
    const at = Date.now()
    seen.push(await above())
    if (shots) await h.locator('[role="dialog"] > div').first().screenshot({ path: `${shots}/look-arrive-${name}-${String(n).padStart(2, '0')}.png` })
    const left = 50 - (Date.now() - at)
    if (left > 0) await wait(left)
  }
  return seen
}

try {
  await v('settings:set', { sounds: false, hintRate: 0, motion: true, lookAsYouSearch: false })
  site.slow(600)
  await wait(600)

  // An everyday user, a word cut short, Wikipedia asked by its line: the page of the word first, its line and picture kept.
  for (const theme of ['light', 'dark']) {
    await look(theme)
    await open('serendipit')
    const before = await above()
    await h.click('[data-look="wikipedia"][data-look-kind="line"]')
    const seen = await film(theme)
    const got = await looks()
    console.log(`(${theme}: ${JSON.stringify(got)})`)
    check(`${theme}: typing “serendipit” offers Serendipity first`, got[0] === 'wikipedia:hit:Serendipity', JSON.stringify(got))
    check(`${theme}: …with its line`, (await h.evaluate(() => document.querySelector('[data-look-kind="hit"] [data-look-line]')?.textContent)) === 'Unplanned, fortunate discovery')
    check(`${theme}: …and the pages that only use the word after it`, got.indexOf('wikipedia:hit:The Medici Effect') > got.indexOf('wikipedia:hit:Serendipity (film)'), JSON.stringify(got))
    check(`${theme}: nothing above the section moves while it waits or as the answers land`, seen.every((one) => one === before), JSON.stringify([...new Set(seen)]))
  }
  await look('light')

  // Words no page has: the wiki's own "Did you mean", said under it that nothing matched; a click takes it.
  await open('w serendipty discovry')
  await h.click('[data-look="wikipedia"][data-look-kind="line"]')
  await until(() => h.evaluate(() => !!document.querySelector('[data-look-kind="suggest"]')))
  const guess = await h.evaluate(() => document.querySelector('[data-look-kind="suggest"]')?.textContent)
  check('nothing found: “Did you mean “serendipity discovery”?”, saying Wikipedia has nothing by those words', /Did you mean “serendipity discovery”\?/.test(guess ?? '') && /has nothing by that name/.test(guess ?? ''), guess)
  await h.click('[data-look-kind="suggest"]')
  check('…a click puts the guess in the box and asks Wikipedia it', (await h.inputValue('[role="dialog"] input')) === 'w serendipity discovery' && (await until(() => site.asked.some((one) => one.includes('search/page?q=serendipity%20discovery')))), await h.inputValue('[role="dialog"] input'))

  // A power user with "Look things up as I search" on: the room is kept while Wikipedia is out, then its row.
  await v('settings:set', { lookAsYouSearch: true, lookSources: ['wikipedia', 'wiktionary'] })
  await wait(400)
  await open('serendipit')
  const roomed = await h.evaluate(() => document.querySelector('[data-look-waiting]')?.getBoundingClientRect().height ?? 0)
  check('as you type: a row\'s room kept while the sites are out', roomed >= 28, String(roomed))
  await until(() => h.evaluate(() => !!document.querySelector('[data-look="wiktionary"][data-look-kind="count"]')))
  await h.click('[data-look="wikipedia"][data-look-kind="count"]')
  await wait(300)
  const mark = () => h.evaluate(() => {
    const row = [...document.querySelectorAll('[data-look-kind="hit"]')].find((one) => one.querySelector('[data-look-title]')?.textContent === 'Serendipity')
    if (row) row.dataset.marked = 'yes'
    // Counted from the section's own head: your own results above may change with the letter, the section's rows may not.
    return row ? Math.round(row.getBoundingClientRect().top - row.closest('[data-island]').getBoundingClientRect().top) : -1
  })
  const top = await mark()
  // Typed on, a letter: every frame till the answer lands keeps the same row in the same place.
  await h.keyboard.type('y')
  const steady = []
  for (let n = 0; n < 18; n++) {
    steady.push(await h.evaluate(() => { const row = document.querySelector('[data-marked="yes"]'); return row?.isConnected ? Math.round(row.getBoundingClientRect().top - row.closest('[data-island]').getBoundingClientRect().top) : -1 }))
    await wait(50)
  }
  check('rows that stay do not move or blink between keystrokes', top > 0 && steady.every((one) => one === top), `${top}: ${steady.join(',')}`)

  // Motion off: the answers are simply there, at full strength in the frame they land.
  await v('settings:set', { motion: false, lookAsYouSearch: false })
  await wait(400)
  await open('roman empire')
  await h.click('[data-look="wikipedia"][data-look-kind="line"]')
  await until(() => h.evaluate(() => !!document.querySelector('[data-look-kind="hit"]')))
  const still = await h.evaluate(() => [...document.querySelectorAll('[data-look-room]')].map((one) => getComputedStyle(one).opacity))
  check('Motion off: answers arrive at full strength, nothing fading', still.length > 0 && still.every((one) => one === '1'), JSON.stringify(still))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
  site.close()
}
done()
