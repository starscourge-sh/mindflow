// Places inside a page are steps of the pane's trail: Feed's Notes, Reading
// and Liked; Media's kinds; Stats' parts; Settings' sections; the journal's
// Week, Month and Year. For each: open the page, pick place A, then place B,
// go Back (⌘[) and land on A, Forward (⌘]) and land on B, Back with the
// mouse's side button and land on A again. Then a relaunch of the app on
// the same data opens on the place last shown.
//
//   npx electron-vite build --outDir out-steps
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-steps/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/place-steps.mjs
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-steps-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')

let c = await sandbox({ width: 1200, height: 800 })
const results = []
const wait = (ms = 700) => c.h.waitForTimeout(ms)
const blur = () => c.h.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
const key = async (one) => { await blur(); await c.h.keyboard.press(one); await wait() }
const side = async (button) => { await c.h.evaluate((b) => window.dispatchEvent(new MouseEvent('mouseup', { button: b })), button); await wait() }

// Each place: how to open its page, how to pick a place, and what the screen says is picked.
const PLACES = [
  {
    name: 'Review', view: 'review', a: 'cards', b: 'stats',
    pick: (one) => `[data-review-tabs] [data-review-tab="${one}"]`,
    read: () => c.h.evaluate(() => document.querySelector('[data-review-tabs] [aria-selected="true"]')?.getAttribute('data-review-tab') ?? '')
  },
  {
    name: 'Feed', view: 'feed', a: 'reading', b: 'liked',
    pick: (one) => `[data-chips="feed"] [data-chip="${one}"]`,
    read: () => c.h.evaluate(() => document.querySelector('[data-chips="feed"] [aria-selected="true"]')?.getAttribute('data-chip') ?? '')
  },
  {
    name: 'Files', view: 'media', a: 'PDFs', b: 'Audio',
    pick: (one) => `[data-media-kinds] button:has-text("${one}")`,
    read: () => c.h.evaluate(() => [...document.querySelectorAll('[data-media-kinds] button[aria-pressed="true"]')].map((one) => one.textContent.trim()).join('|'))
  },
  {
    name: 'Stats', view: 'stats', a: 'Your month', b: 'Your year',
    pick: (one) => `button[aria-label="${one}"]`,
    read: () => c.h.evaluate(() => [...document.querySelectorAll('button[aria-pressed="true"][aria-label]')].map((one) => one.getAttribute('aria-label')).filter((one) => /glance|month|year/i.test(one)).join('|'))
  },
  {
    name: 'Settings', view: 'settings', a: 'Sound', b: 'Keys',
    pick: (one) => `[data-section="${one}"]`,
    read: () => c.h.evaluate(() => document.querySelector('[data-section][aria-current="page"]')?.getAttribute('data-section') ?? '')
  },
  {
    name: 'Journal scales', view: 'day', a: 'weekpage', b: 'monthpage',
    pick: null,
    read: () => c.h.evaluate(() => document.querySelector('header h1')?.textContent ?? '')
  }
]

for (const place of PLACES) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(place.name)) continue
  try {
    await c.send('view', place.view)
    await wait(1200)
    const choose = async (one) => {
      if (place.pick) await c.h.locator(place.pick(one)).first().click()
      else await c.send('view', one)
      await wait()
      return place.read()
    }
    const a = await choose(place.a)
    const b = await choose(place.b)
    await key('Meta+BracketLeft')
    const back = await place.read()
    await key('Meta+BracketRight')
    const forward = await place.read()
    await side(3)
    const mouse = await place.read()
    const ok = a !== b && back === a && forward === b && mouse === a
    results.push({ name: place.name, ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${place.name}: picked ${a}, then ${b}; ⌘[ ${back}; ⌘] ${forward}; side button ${mouse}`)
  } catch (error) {
    results.push({ name: place.name, ok: false })
    console.log(`FAIL  ${place.name}  (${String(error.message ?? error).slice(0, 200)})`)
  }
}

// Relaunched on the same data: the Feed opens on the tab its step kept.
if (!process.env.ONLY || process.env.ONLY.includes('relaunch')) {
  try {
    await c.send('view', 'feed')
    await wait(1000)
    await c.h.locator('[data-chips="feed"] [data-chip="notes"]').first().click()
    await wait()
    await c.h.locator('[data-chips="feed"] [data-chip="reading"]').first().click()
    await wait()
    // The tab the Feed remembers on its own (localStorage) is put elsewhere, so only the step can bring Reading back.
    await c.h.evaluate(() => localStorage.setItem('feedTab', 'notes'))
    await wait(1500)
    await c.close()
    c = await sandbox({ width: 1200, height: 800 })
    await wait(1500)
    const tab = await c.h.evaluate(() => document.querySelector('[data-chips="feed"] [aria-selected="true"]')?.getAttribute('data-chip') ?? '')
    await key('Meta+BracketLeft')
    const back = await c.h.evaluate(() => document.querySelector('[data-chips="feed"] [aria-selected="true"]')?.getAttribute('data-chip') ?? '')
    const ok = tab === 'reading' && back === 'notes'
    results.push({ name: 'relaunch', ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  relaunch: opens on Feed ${tab || '(not on Feed)'}, ⌘[ ${back}`)
  } catch (error) {
    results.push({ name: 'relaunch', ok: false })
    console.log(`FAIL  relaunch  (${String(error.message ?? error).slice(0, 200)})`)
  }
}

await c.close()
const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed.`)
process.exit(failed.length ? 1 : 0)
