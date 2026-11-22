// The app's questions, made part of the app (the user: "looks vibe coded... every once in a while you slap on a
// low-effort looking UI"). A new deck, a deck inside one and a renamed deck are named in place, in the grid or the
// List (Enter keeps, Esc leaves nothing, a click away keeps it if named); a question that needs a sheet gets a small
// one hung from what opened it, with no dimming, the app's own field, a button that says what it does and Cancel,
// and Enter, Esc, the button and a click away all answer it; the yes-or-no sheet is the same sheet. Review's sheets
// and card forms wear its finish. QA_FRAMES=1 only films the same clicks (for main's "before" frames too).
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox QA_SHOTS=dir node qa/ask-sheet.mjs
import { join } from 'path'
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'
const { check, done } = checks()
const c = await sandbox({ width: 1200, height: 800 })
const { h } = c
const shots = process.env.QA_SHOTS
const filming = !!process.env.QA_FRAMES
if (shots) mkdirSync(shots, { recursive: true })
const waitFor = async (test, ms = 6000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(100)) if (await test()) return true; return false }
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const has = (selector) => h.evaluate((selector) => !!document.querySelector(selector), selector)
const made = async () => (await call('decks:made')).sort()
const decks = async () => {
  await c.go('review')
  await waitFor(() => has('[data-review-tab]'))
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click())
  await waitFor(() => has('[data-deck-shelf]'))
  await h.waitForTimeout(300)
}
const menu = async (selector, line) => {
  await h.locator(selector).first().click({ button: 'right' })
  await h.waitForTimeout(350)
  await h.getByRole('menuitem', { name: line }).first().click()
  // The picked line blinks before it runs (about 300ms), as every menu's does.
  await h.waitForTimeout(600)
}
const finish = (to) => h.evaluate((to) => (document.documentElement.dataset.reviewFinish = to), to)
// The field that has the focus, and where it stands.
const focused = () => h.evaluate(() => { const el = document.activeElement; return { inPlace: el?.matches('[data-name-in-place]') ?? false, deck: el?.closest('[data-own-deck], [data-deck-naming], [data-deck-row]')?.outerHTML.match(/data-(own-deck|deck-naming|deck-row)="([^"]*)"/)?.slice(1).join('=') ?? null, value: el?.value ?? null } })
// Nothing over the page: the point beside the sheet is the page itself, and no full-window veil exists.
const noDim = () => h.evaluate(() => {
  const veil = [...document.querySelectorAll('body *')].some((el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.position === 'fixed' && b.width >= innerWidth - 2 && b.height >= innerHeight - 2 && /rgba\(0, 0, 0, 0\.[1-9]/.test(s.backgroundColor) })
  return !veil && !document.querySelector('[data-slot="dialog-overlay"], .bg-black\\/40')
})
const sheet = (which = '[data-ask]') => h.evaluate((which) => {
  const box = document.querySelector(which)
  if (!box) return null
  const field = box.querySelector('[data-ask-field]')
  const f = field && getComputedStyle(field.closest('[class*="border-input"]') ?? field)
  const title = box.querySelector('[data-ask-title]')
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return {
    rem,
    go: box.querySelector('[data-ask-go]')?.textContent?.replace(/[↵⌘]/g, '').trim() ?? null,
    cancel: box.querySelector('[data-ask-cancel]')?.textContent?.replace(/Esc/g, '').trim() ?? null,
    popover: box.matches('[data-slot="popover-content"]'),
    // In the app's own px, whatever its App size: a 15px heading is 15 at 100%, 15.9 at 106%.
    title: title ? Math.round((parseFloat(getComputedStyle(title).fontSize) * 16) / rem) : null,
    field: f ? { h: Math.round(((field.closest('[class*="border-input"]') ?? field).getBoundingClientRect().height * 16) / rem), r: Math.round((parseFloat(f.borderRadius) * 16) / rem), b: f.borderTopWidth } : null,
    box: box.getBoundingClientRect().toJSON(),
    look: getComputedStyle(box).backgroundImage
  }
}, which)
const shot = async (name) => shots && h.screenshot({ path: join(shots, `${name}.png`) })
// Every 50ms through a change: what it looks like as it happens, read by eye afterwards.
const burst = async (name, act, n = 8) => {
  if (!shots) return void (await act())
  const going = act()
  for (let i = 0; i < n; i++) { await h.screenshot({ path: join(shots, `${name}-f${i}.png`) }); await h.waitForTimeout(50) }
  await going
}
// The same surface in each look: light and dark, Satin and Paper.
const looks = async (name, open, close) => {
  for (const [theme, said] of [['light', 'light'], ['dark', 'dark']]) for (const to of ['satin', 'paper']) {
    await c.look(theme)
    await finish(to)
    await open()
    await h.waitForTimeout(450)
    await shot(`${name}-${said}-${to}`)
    await close()
  }
  await c.look('light')
  await finish('satin')
}
const esc = async () => { await h.keyboard.press('Escape'); await h.waitForTimeout(300) }
// A click on nothing: the decks page's own margin, never a deck (a fixed point landed on one as decks were added).
const away = async () => { await h.locator('[data-deck-shelf]').click({ position: { x: 4, y: 4 } }); await h.waitForTimeout(300) }

try {
  await call('cards:list', [{ term: 'Zebra question', meaning: 'Zebra answer #zoo' }, { term: 'Yak question', meaning: 'Yak answer #zoo' }])
  await decks()

  if (filming) {
    // The same clicks on any build: New deck, Rename…, New deck inside, the study set's question, Delete deck…
    if (process.env.QA_ONLY !== 'siblings') {
    await looks('new-deck', () => h.click('[data-deck-new]'), esc)
    await looks('rename-deck', () => menu('[data-own-deck="zoo"]', 'Rename…'), esc)
    await looks('study-set', () => menu('[data-own-deck="zoo"]', 'Save as a study set…'), esc)
    await looks('yes-no', () => menu('[data-own-deck="zoo"]', 'Delete deck…'), esc)
    // Review's card forms, a study card and Stats, in each finish.
    const shut = async () => { await esc(); const cancel = h.getByRole('button', { name: /^(Cancel|Done)/ }).first(); if (await cancel.isVisible().catch(() => false)) await cancel.click(); await h.waitForTimeout(300); await decks() }
    await looks('make-a-card', () => menu('[data-own-deck="zoo"]', 'Make a card'), shut)
    await looks('add-many', () => menu('[data-own-deck="zoo"]', 'Add many at once'), shut)
    await looks('from-a-picture', () => menu('[data-own-deck="zoo"]', 'Cards from a picture'), shut)
    await looks('study-card', () => menu('[data-own-deck="zoo"]', 'Study'), decks)
    await looks('stats', () => h.evaluate(() => document.querySelector('[data-review-tab="stats"]').click()), () => h.evaluate(() => document.querySelector('[data-review-tab="decks"]').click()))
    }
    // The siblings it should match: ⌘K and Tasks' date picker.
    await c.go('home')
    await looks('cmdk', async () => { await h.keyboard.press('Meta+k'); await h.waitForTimeout(300) }, esc)
    // A task's page, with its date picker: the first task on Tasks, opened.
    const task = (await call('tasks')).find((one) => !one.done && !one.completedAt) ?? (await call('tasks'))[0]
    await c.send('task', task.id)
    await h.waitForTimeout(1200)
    if (await waitFor(() => has('[data-date-picker]'), 3000)) await looks('date-picker', () => h.locator('[data-date-picker]').first().click(), esc)
    else check('the Tasks date picker was found to film', false)
  } else if (process.env.QA_BOOKS) {
    // Books are hidden in the sandbox: this part runs on an empty book (QA_ARGS='').
    // An empty book opens on the welcome: passed, as a person who has seen it.
    await call('settings:set', { welcomed: new Date().toISOString() })
    await h.reload()
    await h.waitForTimeout(1500)
    const books = async () => { await c.go('settings'); await h.waitForTimeout(600); await h.click('[data-section="Import and backups"]').catch(() => {}); await h.waitForTimeout(600) }
    await books()
    await looks('new-book', () => h.getByRole('button', { name: /^New book/ }).first().click(), esc)
    await looks('rename-book', () => h.locator('[data-setting]', { hasText: 'Your first book' }).getByRole('button', { name: 'Rename' }).click(), esc)
    await h.locator('[data-setting]', { hasText: 'Your first book' }).getByRole('button', { name: 'Rename' }).click()
    await h.waitForTimeout(300)
    const field = await focused()
    check('B. a book is renamed in its own row, its name picked', field.inPlace && !!field.value, JSON.stringify(field))
    await h.keyboard.type('Thesis book')
    await h.keyboard.press('Enter')
    check('B. Enter renames it', await waitFor(() => has('[data-setting-title="Thesis book"]')))
    await h.getByRole('button', { name: /^New book/ }).first().click()
    await h.waitForTimeout(300)
    check('B. "New book" puts a name field on a new row under the books', (await focused()).inPlace && (await has('[data-setting-title="New book"] [data-name-in-place]')))
    await esc()
    check('B. Esc takes the new row away', !(await has('[data-setting-title="New book"]')))
  } else {
    // 1. "+ New deck": a tile in the grid with its name field focused, no sheet, nothing dimmed.
    const before = await made()
    const bar = () => h.evaluate(() => [...document.querySelectorAll('[data-deck-new], [data-deck-look-pick], [data-review-finish-pick], [data-review-tab]')].map((el) => { const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map(Math.round).join(',') }).join(' '))
    const still = await bar()
    await burst('new-deck-open', () => h.click('[data-deck-new]'))
    await waitFor(async () => (await focused()).inPlace, 2000)
    const at = await focused()
    check('1. "+ New deck" puts a focused name field in the deck grid', at.inPlace && /deck-naming/.test(at.deck ?? ''), JSON.stringify(at))
    check('1. ...with no sheet or dialog and nothing dimmed', !(await has('[data-ask], [role="dialog"]')) && (await noDim()))
    check('1. the buttons above the decks hold still as the tile comes in', (await bar()) === still)
    await shot('new-deck-naming')
    await h.keyboard.type('Zymurgy')
    await burst('new-deck-enter', () => h.keyboard.press('Enter'), 6)
    check('1. Enter makes the deck there', await waitFor(() => has('[data-own-deck="zymurgy"]')))
    check('1. ...and the field is gone', !(await has('[data-name-in-place]')))
    await h.waitForTimeout(400)

    // 2. Esc leaves nothing behind; a click away on nothing typed leaves nothing; a click away with a name keeps it.
    await h.click('[data-deck-new]')
    await waitFor(async () => (await focused()).inPlace, 2000)
    await h.keyboard.type('Never')
    await esc()
    check('2. Esc takes the new tile away and makes nothing', !(await has('[data-deck-naming]')) && !(await made()).includes('never'))
    await h.click('[data-deck-new]')
    await waitFor(async () => (await focused()).inPlace, 2000)
    await away()
    check('2. a click away with nothing typed leaves nothing', !(await has('[data-deck-naming]')) && (await made()).length === before.length + 1)
    await h.click('[data-deck-new]')
    await waitFor(async () => (await focused()).inPlace, 2000)
    await h.keyboard.type('Brewing')
    await away()
    check('2. a click away with a name keeps it', await waitFor(() => has('[data-own-deck="brewing"]')))

    // 3. Rename in place: the tile's own name becomes the field.
    await menu('[data-own-deck="zymurgy"]', 'Rename…')
    await waitFor(async () => (await focused()).inPlace, 2000)
    const renaming = await focused()
    check('3. "Rename…" puts the name field on the deck itself, its name picked', renaming.inPlace && renaming.deck === 'own-deck=zymurgy' && renaming.value === 'Zymurgy', JSON.stringify(renaming))
    check('3. ...no sheet', !(await has('[data-ask]')))
    await shot('rename-deck-in-place')
    await h.keyboard.type('Ferment')
    await h.keyboard.press('Enter')
    check('3. Enter renames it in place', await waitFor(() => has('[data-own-deck="ferment"]')) && !(await has('[data-own-deck="zymurgy"]')))
    await menu('[data-own-deck="ferment"]', 'Rename…')
    await h.keyboard.type('Nothing')
    await esc()
    check('3. Esc leaves the name as it was', await has('[data-own-deck="ferment"]') && !(await has('[data-own-deck="nothing"]')))

    // 4. A deck inside: named in the grid, kept inside.
    await menu('[data-own-deck="ferment"]', 'New deck inside')
    await waitFor(async () => (await focused()).inPlace, 2000)
    const inside = await focused()
    check('4. "New deck inside" names it in the grid, saying where', inside.inPlace && inside.deck === 'deck-naming=ferment', JSON.stringify(inside))
    await h.keyboard.type('Cells')
    await h.keyboard.press('Enter')
    check('4. Enter makes Ferment / Cells', await waitFor(async () => (await made()).includes('ferment-cells')))

    // 5. The List: rename in its row, New deck on a row at its top.
    await h.click('[data-deck-look-to="list"]')
    await waitFor(() => has('[data-deck-list]'))
    await menu('[data-deck-row="brewing"]', 'Rename…')
    const row = await focused()
    check('5. in the List, Rename… is in the deck\'s row', row.inPlace && row.deck === 'deck-row=brewing', JSON.stringify(row))
    await h.keyboard.type('Malt')
    await h.keyboard.press('Enter')
    check('5. ...and Enter renames it', await waitFor(() => has('[data-deck-row="malt"]')))
    await h.click('[data-deck-new]')
    const listNew = await focused()
    check('5. New deck in the List is a row at its top', listNew.inPlace && /deck-naming/.test(listNew.deck ?? ''), JSON.stringify(listNew))
    await esc()
    await h.click('[data-deck-look-to="pockets"]')
    await waitFor(() => has('[data-deck-grid]'))

    // 6. ⌘K "New deck" comes to the grid and names it there.
    await c.go('home')
    await h.keyboard.press('Meta+k')
    await h.waitForTimeout(400)
    await h.keyboard.type('New deck')
    await h.waitForTimeout(400)
    await h.keyboard.press('Enter')
    check('6. ⌘K "New deck" opens Decks with the name field ready in the grid', await waitFor(async () => { const f = await focused(); return f.inPlace && /deck-naming/.test(f.deck ?? '') }, 5000))
    await esc()
    await decks()

    // 7. A question that needs a sheet (a tag, asked from a deck): hung from the deck, the app's type and field, a named
    // button and Cancel, no dim. A study set is no longer asked for in one: it is named in place (7b).
    const askFromDeck = () => h.evaluate(() => void window.dispatchEvent(new CustomEvent('haligtree:ask', { detail: { question: 'Tag it with', placeholder: 'thesis', field: 'tag', action: 'Tag it', at: document.querySelector('[data-own-deck="zoo"]').getBoundingClientRect(), review: true, answer: () => {} } })))
    for (const to of ['satin', 'paper']) {
      await finish(to)
      await burst(`tag-ask-open-${to}`, askFromDeck, 6)
      const s = await sheet()
      const tile = await h.evaluate(() => document.querySelector('[data-own-deck="zoo"]').getBoundingClientRect().toJSON())
      check(`7. (${to}) the sheet names its action and has Cancel`, s?.go === 'Tag it' && s?.cancel === 'Cancel', JSON.stringify(s))
      check(`7. (${to}) it is a small sheet hung from the deck, not a window-wide one`, !!s && s.popover && (s.box.width * 16) / s.rem <= 360 && (Math.abs(s.box.top - tile.bottom) <= 24 || Math.abs(tile.top - s.box.bottom) <= 24) && s.box.left < tile.right && s.box.right > tile.left, JSON.stringify({ box: s?.box, tile }))
      check(`7. (${to}) nothing dims the window`, await noDim())
      check(`7. (${to}) its question is at the words' own size (14px), not a heading`, s?.title === 14, String(s?.title))
      check(`7. (${to}) its field is the app's field: 28px, 8px corners, a hairline`, s?.field?.h === 28 && s?.field?.r === 8 && s?.field?.b === '1px', JSON.stringify(s?.field))
      check(`7. (${to}) it wears Review's ${to} finish`, to === 'satin' ? /gradient/.test(s?.look ?? '') : /url\(/.test(s?.look ?? ''), (s?.look ?? '').slice(0, 60))
      await esc()
    }
    await finish('satin')
    // 7b. "Save as a study set…": named where it will stand, among the study sets; Enter saves, Esc leaves nothing, a click away keeps it.
    await menu('[data-own-deck="zoo"]', 'Save as a study set…')
    const ready = await h.evaluate(() => ({ sheet: !!document.querySelector('[data-ask]'), inPlace: !!document.activeElement?.closest('[data-study-set-naming]') }))
    check('7b. "Save as a study set…" names the set in place among the study sets, focused, no sheet', ready.inPlace && !ready.sheet, JSON.stringify(ready))
    await shot('study-set-in-place')
    await h.keyboard.type('Exam Friday')
    await h.keyboard.press('Enter')
    check('7b. Enter saves it', await waitFor(async () => (await call('sets:list')).some((one) => one.name === 'Exam Friday')))
    await menu('[data-own-deck="zoo"]', 'Save as a study set…')
    await h.keyboard.type('Not this')
    await esc()
    check('7b. Esc leaves it unmade', !(await has('[data-study-set-naming]')) && !(await call('sets:list')).some((one) => one.name === 'Not this'))
    await menu('[data-own-deck="zoo"]', 'Save as a study set…')
    await h.keyboard.type('Away')
    await away()
    check('7b. a click away keeps it, as a name typed in place is kept', await waitFor(async () => (await call('sets:list')).some((one) => one.name === 'Away')))

    // 8. The yes-or-no sheet is the same sheet.
    await burst('yes-no-open', () => menu('[data-own-deck="malt"]', 'Delete deck…'), 6)
    const sure = await sheet('[data-sure]')
    check('8. Delete deck… asks in the same sheet: "Delete deck" and Cancel, hung from the deck, no dim', sure?.go === 'Delete deck' && sure?.cancel === 'Cancel' && sure.popover && (await noDim()), JSON.stringify(sure))
    check('8. ...its question at the app\'s size', sure?.title === 14, String(sure?.title))
    await h.click('[data-ask-cancel]')
    check('8. Cancel keeps the deck', await has('[data-own-deck="malt"]') && !(await has('[data-sure]')))
    await menu('[data-own-deck="malt"]', 'Delete deck…')
    await h.keyboard.press('Enter')
    check('8. Enter deletes it', await waitFor(async () => !(await made()).includes('malt')))

    // 8b. "Go back to this copy?" (a restore from a backup) is the same yes-or-no sheet, its key words in bold, Restore in the red tint.
    const restore = await h.evaluate(async () => {
      window.dispatchEvent(new CustomEvent('haligtree:restore-ask', { detail: { name: 'haligtree-2026-10-14.db', token: 'probe' } }))
      await new Promise((r) => setTimeout(r, 400))
      const one = document.querySelector('[data-sure]')
      return one && { go: one.querySelector('[data-ask-go]')?.textContent, red: one.querySelector('[data-ask-go]')?.getAttribute('data-variant') ?? one.querySelector('[data-ask-go]')?.className.includes('destructive'), bold: [...one.querySelectorAll('strong')].map((el) => el.textContent) }
    })
    check('8. a restore asks in the same sheet: bold "Then Haligtree starts again", "Restore and start again" in red', !!restore && /Restore and start again/.test(restore.go ?? '') && !!restore.red && restore.bold.some((one) => /starts again/.test(one)), JSON.stringify(restore))
    await esc()
    check('8. ...and Esc says no', !(await has('[data-sure]')))

    // 9. Every kind of field the sheet asks with answers Enter, Esc and its button: words, a tag, a name typed before.
    const asked = (detail, act) => h.evaluate(async ({ detail, act }) => {
      const said = new Promise((answer) => window.dispatchEvent(new CustomEvent('haligtree:ask', { detail: { ...detail, at: null, review: false, answer } })))
      await new Promise((r) => setTimeout(r, 300))
      const field = document.querySelector('[data-ask-field]')
      field.focus()
      if (act !== 'esc' && act !== 'skip') document.execCommand('insertText', false, 'thesis')
      await new Promise((r) => setTimeout(r, 100))
      const sheet = document.querySelector('[data-ask]').getBoundingClientRect()
      if (act === 'enter') field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
      if (act === 'button') document.querySelector('[data-ask-go]').click()
      if (act === 'esc') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      if (act === 'skip') document.querySelector('[data-ask-skip]').click()
      return { said: await said, top: Math.round(sheet.top) }
    }, { detail, act })
    for (const [kind, detail] of [['words', { question: 'One task from these 2. What is it?', placeholder: 'e.g.', action: 'Make the task' }], ['tag', { question: 'Tag these 2 with', placeholder: 'thesis', field: 'tag', action: 'Tag 2' }], ['who', { question: 'Who said it? A quote is kept with its source.', placeholder: 'e.g. Alan Kay', field: 'attribution', skip: 'Unattributed', action: 'Keep the quote' }]]) {
      const enter = await asked(detail, 'enter')
      check(`9. ${kind}: Enter answers`, enter.said === 'thesis', JSON.stringify(enter))
      check(`9. ${kind}: asked by keys, it sits under the window's top, not a page-wide sheet`, enter.top > 40 && enter.top < 220, String(enter.top))
      check(`9. ${kind}: its button answers`, (await asked(detail, 'button')).said === 'thesis')
      check(`9. ${kind}: Esc lets it go`, (await asked(detail, 'esc')).said === null)
    }
    check('9. who: "Unattributed" answers with nothing, kept without', (await asked({ question: 'Who said it?', placeholder: '', field: 'attribution', skip: 'Unattributed', action: 'Keep the quote' }, 'skip')).said === '')

    // 10. Review's card forms are one form, each in the finish chosen.
    for (const [name, open] of [['make-a-card', () => menu('[data-own-deck="zoo"]', 'Make a card')], ['add-many', () => menu('[data-own-deck="zoo"]', 'Add many at once')]]) {
      for (const to of ['satin', 'paper']) {
        await decks()
        await finish(to)
        await open()
        await waitFor(() => has('[data-card-form]'))
        const form = await h.evaluate(() => { const f = document.querySelector('[data-card-form]'); const go = f?.querySelector('[data-card-form-go]'); const foot = f?.querySelector('[data-card-form-foot]'); return f && { look: getComputedStyle(f).backgroundImage, go: go?.textContent, goRight: Math.round(foot.getBoundingClientRect().right - go.getBoundingClientRect().right), deck: !!f.querySelector('[data-deck-pick]'), tags: !!f.querySelector('[data-card-form-tags]'), both: !!f.querySelector('[data-new-both]') } })
        check(`10. ${name} (${to}) wears the ${to} finish`, to === 'satin' ? /gradient/.test(form?.look ?? '') : /url\(/.test(form?.look ?? ''), (form?.look ?? '').slice(0, 50))
        check(`10. ${name} (${to}) has the one foot: deck, tags, Both ways, then Cancel and its button at the right`, !!form && form.deck && form.tags && form.both && form.goRight <= 1, JSON.stringify(form))
        await shot(`${name}-${to}`)
        await h.keyboard.press('Escape')
        await h.waitForTimeout(300)
      }
    }

    // 11. At phone width (390 by 844): the name field and the sheet fit, nothing cut off, nothing sideways.
    await c.size(390, 844)
    await decks()
    await h.click('[data-deck-new]')
    await waitFor(async () => (await focused()).inPlace, 2000)
    const narrow = await h.evaluate(() => { const f = document.querySelector('[data-name-in-place]').getBoundingClientRect(); return { fits: f.left >= 0 && f.right <= innerWidth, sideways: document.scrollingElement.scrollWidth > innerWidth } })
    await shot('phone-new-deck')
    check('11. at the narrowest window the new deck\'s name field fits, no sideways scroll', narrow.fits && !narrow.sideways, JSON.stringify(narrow))
    await esc()
    await askFromDeck()
    await h.waitForTimeout(300)
    const small = await sheet()
    await shot('phone-sheet')
    const wide = await h.evaluate(() => innerWidth)
    check(`11. at the narrowest window (${wide} wide: asked for 390, the main window stops there) the sheet stays 12px or more inside it`, !!small && small.box.left >= 11 && small.box.right <= wide - 11, JSON.stringify(small?.box))
    await esc()
  }
} catch (error) {
  await shot('failed').catch(() => {})
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
