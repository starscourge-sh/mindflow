// Paste cards: in Review's "All cards", a list of cards pasted one a line shows at once as fronts and backs,
// its separator found on its own (|, ;, tab, " - ") and switchable; a deck and tags go on every card; one
// Undo takes them all back. A .txt dropped on the box reads in; a spreadsheet's header row names the columns. From ⌘K "Paste cards" too.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/paste-cards.mjs
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 900 })
const { h } = c
const shots = process.env.QA_SHOTS
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
// The cards it will make, laid out as cards: each one's front, then its back.
const preview = () => h.evaluate(() => [...document.querySelectorAll('[data-paste-preview] > div')].map((card) => [...card.querySelectorAll(':scope > span')].map((side) => side.textContent)))
const pressed = () => h.evaluate(() => document.querySelector('[data-paste-cards] button[aria-pressed="true"]')?.getAttribute('aria-label'))
const chip = (label) => h.evaluate((label) => [...document.querySelectorAll('[data-paste-cards] button[aria-pressed]')].find((one) => one.getAttribute('aria-label') === label)?.click(), label)
// The deck, as Make a card picks one: the deck picker, "New deck…" when it is not one yet, named in its sheet.
const deckTo = async (words) => {
  await h.click('[data-paste-cards] [data-deck-pick]')
  await h.waitForTimeout(300)
  const tag = words.toLowerCase().replace('::', '-')
  if (await h.locator(`[data-deck-pick-to="${tag}"]`).count()) return void (await h.click(`[data-deck-pick-to="${tag}"]`))
  await h.click('[data-deck-pick-new]')
  await waitFor(() => h.evaluate(() => document.activeElement?.matches('[data-ask-field]')))
  await h.keyboard.type(words)
  await h.keyboard.press('Enter')
  await waitFor(() => h.evaluate((tag) => document.querySelector('[data-paste-cards] [data-deck-pick]')?.getAttribute('data-deck-pick') === tag, tag))
}
const shot = async (name, again) => {
  if (!shots) return
  for (const [theme, said] of [['paper', 'light'], ['dark', 'dark']]) {
    await c.theme(theme)
    await again()
    await h.waitForTimeout(600)
    await h.screenshot({ path: join(shots, `${name}-${said}.png`) })
  }
  await c.theme('paper')
  await again()
}
const open = async () => {
  await c.go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="cards"]').click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-paste-open]')))
  await h.evaluate(() => document.querySelector('[data-paste-open]').click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-paste-text]')))
}
const LIST = 'hola | hello\nperro | dog\ngato | cat | a pet\njust a line'
try {
  await open()
  await h.locator('[data-paste-text]').fill(LIST)
  check('the separator is found on its own', await waitFor(async () => (await pressed()) === '|'), await pressed())
  check('fronts and backs show as you type', await waitFor(async () => JSON.stringify((await preview())[0]) === '["hola","hello"]' && (await preview()).length === 3), JSON.stringify(await preview()))
  check('a third column joins the back', (await preview())[2]?.[1] === 'cat · a pet', (await preview())[2]?.[1])
  check('a line with no back is said and left out', /1 line has no back/.test(await h.evaluate(() => document.querySelector('[data-paste-cards]').textContent)))
  // Switched: split at ";" nothing splits.
  await chip(';')
  check('switching the separator redraws the columns', await waitFor(async () => (await preview()).length === 0))
  await chip('|')
  await deckTo('Spanish::Basics')
  await h.locator('[data-card-form-tags]').fill('vocab')
  check('a deck and tags say what goes on each card', /#spanish-basics #vocab/.test(await h.evaluate(() => document.querySelector('[data-paste-cards]').textContent)))
  await shot('paste-cards', async () => { await open(); await h.locator('[data-paste-text]').fill(LIST); await deckTo('Spanish::Basics') })
  await h.locator('[data-card-form-tags]').fill('vocab')
  const before = (await call('cards:all')).length
  await h.evaluate(() => document.querySelector('[data-paste-add]').click())
  const added = async () => (await call('cards:all')).filter((one) => ['hola', 'perro', 'gato'].includes(one.prompt))
  check('"Add 3 cards" adds them, tagged', await waitFor(async () => { const now = await added(); return now.length === 3 && now.every((one) => one.tags.includes('spanish-basics') && one.tags.includes('vocab')) }), JSON.stringify((await added()).map((one) => one.tags)))
  check('and they show in the list', await waitFor(async () => (await h.evaluate(() => document.querySelectorAll('[data-card-row]').length)) === before + 3))
  await h.evaluate(() => document.activeElement?.blur())
  await h.keyboard.press('Meta+z')
  check('one Undo takes all three back', await waitFor(async () => (await added()).length === 0))
  // A .txt dropped on the box, tab-separated.
  await h.evaluate(() => document.querySelector('[data-paste-open]').click())
  await waitFor(() => h.evaluate(() => !!document.querySelector('[data-paste-text]')))
  await h.evaluate(() => {
    const data = new DataTransfer()
    data.items.add(new File(['casa\thouse\nlibro\tbook'], 'words.txt', { type: 'text/plain' }))
    document.querySelector('[data-paste-text]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }))
  })
  check('a dropped .txt reads in, split at tabs', await waitFor(async () => (await pressed()) === 'Tab' && (await preview()).length === 2), JSON.stringify(await preview()))
  // A spreadsheet's first row of column names is not a card: it names the columns.
  await h.locator('[data-paste-text]').fill('English,Spanish\nhouse,casa\nbook,libro')
  check('a first row of column names is read as headings, not a card', await waitFor(async () => (await preview()).length === 2 && await h.evaluate(() => !!document.querySelector('[data-paste-headings]'))), JSON.stringify(await preview()))
  // From ⌘K.
  await c.go('home')
  await h.keyboard.press('Meta+k')
  await h.waitForTimeout(500)
  await h.keyboard.type('Add many cards at once', { delay: 15 })
  await h.waitForTimeout(500)
  await h.keyboard.press('Enter')
  check('⌘K "Add many cards at once" opens it', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-paste-text]'))))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
