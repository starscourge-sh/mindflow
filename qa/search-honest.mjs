// ⌘K says what it found (the user, 15 Nov 2026, of "faustian": "why is it lying about occurence?"; 17 Nov, of "faust":
// "what are these alleged close matchers and where are they?"). A word no note has lists nothing as a match: a line
// says so, and only a real slip of the keys finds notes under "Close spellings", each row naming the word that stood in,
// its preview lighting it; a word a note has lists that note and no close spellings at all. Then “Look things up as I
// search” (ask 52): off, nothing is asked of any site; turned on in Settings, Wikipedia and Wiktionary are asked as you
// type and each that found something is one folded row ("Wikipedia · 3 results"), opening to its answers hung under it;
// a site with nothing found shows nothing; Gutenberg and the Stanford Encyclopedia keep their lines.
// The sites are a stand-in (qa/wiki-stand-in.mjs).
//   QA_DATA=<a copy of the seeded sandbox> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/search-honest.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
import { standIn } from './wiki-stand-in.mjs'
process.env.QA_ARGS ??= '--sandbox'
const site = await standIn()
process.env.HALIGTREE_QA_SITES = site.base

const { check, done } = checks()
const c = await sandbox({ width: 1400, height: 860 })
const { h, v, electron } = c
const shots = process.env.QA_SHOTS ?? '/tmp'
const wait = (ms) => h.waitForTimeout(ms)
const until = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await test()) return true; return false }
const doc = (text) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const searches = () => site.asked.filter((one) => one.includes('/w/rest.php/v1/search/page'))
/** ⌘K opened, the words typed, what it shows once it has looked: each island's name and rows, the line above them, the preview's lit words. */
const ask = async (words) => {
  await h.keyboard.press('Escape')
  await h.keyboard.press('Meta+k')
  await h.waitForSelector('[role="dialog"] input', { timeout: 5000 })
  await h.keyboard.type(words, { delay: 25 })
  await wait(1500)
  return h.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    return {
      none: dialog?.querySelector('[data-search-none]')?.textContent?.trim() ?? '',
      text: dialog?.textContent ?? '',
      islands: [...(dialog?.querySelectorAll('[data-island-head]') ?? [])].map((one) => one.textContent?.trim()),
      near: [...(dialog?.querySelectorAll('[data-near-word]') ?? [])].map((one) => one.closest('[data-row]')?.textContent?.trim() ?? ''),
      lit: [...(dialog?.querySelectorAll('[data-cmdk-panel] .find-and-replace-result') ?? [])].map((one) => one.textContent),
      litNow: dialog?.querySelector('[data-cmdk-panel] .find-and-replace-result-current')?.getBoundingClientRect().top ?? null,
      panel: dialog?.querySelector('[data-cmdk-panel]')?.getBoundingClientRect().bottom ?? null,
      looks: [...(dialog?.querySelectorAll('[data-look]') ?? [])].map((one) => `${one.getAttribute('data-look')}:${one.getAttribute('data-look-kind')}:${one.querySelector('[data-look-title]')?.textContent}`),
      // The look rows all after every result of your own.
      under: [...(dialog?.querySelectorAll('[data-look]') ?? [])].every((row) => [...dialog.querySelectorAll('[data-row]')].every((one) => one.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING))
    }
  })
}
const wear = (theme) => h.evaluate((theme) => { localStorage.setItem('theme', theme); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
const shoot = async (name) => {
  for (const theme of ['paper', 'dark']) {
    await wear(theme)
    await wait(300)
    await h.locator('[role="dialog"] > div').first().screenshot({ path: `${shots}/a52-${name}-${theme}.png` })
  }
  await wear('paper')
}
try {
  await electron.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (url) => void globalThis.__opened.push(url) })
  await v('settings:set', { sounds: false, hintRate: 0 })
  // A note with the word far down, so the preview has to bring it into view.
  const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long note about Goethe and the old legend.`)
  await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), { type: 'doc', content: [...lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })), { type: 'paragraph', content: [{ type: 'text', text: 'Faust sells his soul here, at the end.' }] }] })
  await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('A Gaussian curve of the marks this term'))
  // Words one letter from "faust" that are not a slip of it (17 Nov: "fault" and "fast" were its 52 close spellings).
  await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('It was not my fault: we ran fast past the gate.'))
  await h.evaluate((body) => window.api.captures.create({ kind: 'note', body }), doc('Line one of a pact.\nHe struck a bargain with the devil at the crossroads.'))
  await wait(800)

  const missing = await ask('faustian')
  console.log(`(“faustian”: ${missing.none || 'no line'}; islands ${JSON.stringify(missing.islands)})`)
  check('a word no note has: “Gaussian” is not a slip of it, so no close spellings', !missing.islands.some((one) => /Close spellings/.test(one)), JSON.stringify(missing.islands))

  const found = await ask('faust')
  console.log(`(“faust”: islands ${JSON.stringify(found.islands)}, lit ${JSON.stringify(found.lit)}, the current one at ${found.litNow}, the panel's foot at ${found.panel})`)
  check('a word a note has: no "nothing has" line', !found.none, found.none)
  check('and no close spellings beside the real match (“fault” and “fast” are other words)', !found.islands.some((one) => /Close spellings/.test(one)), JSON.stringify(found.islands))
  check('its preview lights the word where it stands', found.lit.some((one) => /faust/i.test(one)), JSON.stringify(found.lit))
  check('and brings it into view, far down a long note', found.litNow !== null && found.panel !== null && found.litNow < found.panel, `${found.litNow} < ${found.panel}`)

  const slip = await ask('bargsin devil')
  console.log(`(“bargsin devil”: ${slip.none}; rows ${JSON.stringify(slip.near.slice(0, 3))}; lit ${JSON.stringify(slip.lit)})`)
  check('a real slip, nothing as typed: the line says so', /Nothing has “bargsin devil” as you typed it/.test(slip.none), slip.none)
  check('the row names the word that stood in: Has “bargain”', slip.near.some((one) => /Has “bargain”/.test(one) && /crossroads/.test(one)), JSON.stringify(slip.near))
  check('and the preview lights “bargain”', slip.lit.some((one) => /bargain/i.test(one)), JSON.stringify(slip.lit))
  await shoot('close-spelling')

  // Look things up as I search, off: nothing is asked of any site.
  const before = searches().length
  const off = await ask('faustian bargin')
  check('“Look things up as I search” off: no site is asked as you type', searches().length === before, `${searches().length - before} asked`)
  check('…and Wikipedia keeps its “Search Wikipedia for” line', off.looks.includes('wikipedia:line:Search Wikipedia for “faustian bargin”'), JSON.stringify(off.looks))

  // Turned on in Settings, by its switch.
  await h.keyboard.press('Escape')
  await c.go('settings')
  await wait(600)
  await h.fill('input[placeholder="Search…"]', 'Look things up')
  await wait(500)
  const toggle = h.locator(`[data-setting-title="Look things up as I search"] [role="switch"]`)
  const hasSetting = await toggle.count()
  check('Settings has “Look things up as I search”, off at first', hasSetting === 1 && (await toggle.getAttribute('aria-checked')) === 'false', `${hasSetting} found`)
  if (hasSetting) await toggle.click()
  await wait(400)
  for (const theme of ['paper', 'dark']) {
    await wear(theme)
    await wait(300)
    await h.screenshot({ path: `${shots}/a52-settings-${theme}.png` })
  }
  await wear('paper')
  const kept = await v('settings')
  check('…and its switch turns it on, Wikipedia and Wiktionary ticked', kept.lookAsYouSearch === true && kept.lookSources?.join() === 'wikipedia,wiktionary', JSON.stringify({ on: kept.lookAsYouSearch, sites: kept.lookSources }))

  const on = await ask('faustian bargin')
  await until(() => h.evaluate(() => !!document.querySelector('[data-look="wikipedia"][data-look-kind="count"]')))
  const onNow = await ask('faustian bargin')
  console.log(`(looked up: ${JSON.stringify(onNow.looks)})`)
  check('on: Wikipedia is asked as you type, with the words typed', site.asked.some((one) => one.includes('en.wikipedia.org/w/rest.php') && one.includes('faustian%20bargin')), searches().slice(-2).join(' '))
  check('…and Fandom never', !site.asked.some((one) => /fandom/.test(one)), site.asked.filter((one) => /fandom/.test(one)).join(' '))
  check('one folded row a site: “Wikipedia · 3 results”', onNow.looks.includes('wikipedia:count:Wikipedia · 3 results'), JSON.stringify(onNow.looks))
  check('…under your own results', onNow.under, JSON.stringify(onNow.looks))
  check('…folded: none of its answers shows yet', !onNow.looks.some((one) => one.startsWith('wikipedia:hit')), JSON.stringify(onNow.looks))
  check('Gutenberg and the Stanford Encyclopedia keep their lines', ['gutenberg:line', 'sep:line'].every((kind) => onNow.looks.some((one) => one.startsWith(kind))), JSON.stringify(onNow.looks))
  void on

  // Opened by a click: its three answers, each with its line, hung under it.
  await h.click('[data-look="wikipedia"][data-look-kind="count"]')
  await wait(400)
  const open = await h.evaluate(() => {
    const head = document.querySelector('[data-look="wikipedia"][data-look-kind="count"]')
    const hits = [...document.querySelectorAll('[data-look="wikipedia"][data-look-kind="hit"]')]
    return { expanded: head?.getAttribute('aria-expanded'), hits: hits.map((one) => one.textContent), tree: hits.length > 0 && hits.every((one) => one.parentElement?.querySelector(':scope > svg') && one.getBoundingClientRect().left > head.getBoundingClientRect().left + 10) }
  })
  check('a click opens it: its answers, a line each', open.expanded === 'true' && open.hits.length === 3 && open.hits.some((one) => /Faustian bargain/.test(one) && /supreme value/.test(one)), JSON.stringify(open))
  check('…hung under its row as children, on a trunk', open.tree, JSON.stringify(open))
  await h.hover('[data-look="wikipedia"][data-look-kind="hit"] >> nth=2')
  await wait(300)
  await shoot('look-open')
  // ↵ on its row folds it again.
  await h.hover('[data-look="wikipedia"][data-look-kind="count"]')
  await h.keyboard.press('Enter')
  await wait(300)
  check('↵ on its row folds it', await h.evaluate(() => !document.querySelector('[data-look-kind="hit"]') && document.querySelector('[data-look="wikipedia"][data-look-kind="count"]')?.getAttribute('aria-expanded') === 'false'))
  await shoot('look-folded')

  // A site that found nothing shows nothing.
  const none = await ask('nothing like it')
  await wait(800)
  const noneNow = await h.evaluate(() => [...document.querySelectorAll('[data-look]')].map((one) => `${one.getAttribute('data-look')}:${one.getAttribute('data-look-kind')}`))
  check('a site that found nothing shows nothing', !noneNow.some((one) => one.startsWith('wikipedia') || one.startsWith('wiktionary')), JSON.stringify(noneNow))
  void none

  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
  site.close()
}
done()
