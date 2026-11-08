// Places inside a page are steps of the pane's trail: Feed's Notes, Reading
// and Liked; Media's kinds; Stats' parts; Settings' sections; What Haligtree can do's tabs; the journal's
// Week, Month and Year; a tag's Read and Manage. For each: open the page, pick place A, then place B,
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
// Files' tabs show only for kinds the book holds: a book and a recording beside the sandbox's pictures.
const readKind = () => c.h.evaluate(() => [...document.querySelectorAll('[data-media-kinds] button[aria-pressed="true"]')].map((one) => one.textContent.trim()).filter((one) => one !== 'Deck pictures').join('|'))
const pdfBytes = (word) => {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R >>', null]
  const stream = `BT 40 300 Td (${word}) Tj ET`
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = '%PDF-1.4\n'
  const at = []
  objects.forEach((body, i) => (at.push(out.length), (out += `${i + 1} 0 obj\n${body}\nendobj\n`)))
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return [...Buffer.from(out)]
}
const wav = () => {
  const b = Buffer.alloc(844)
  b.write('RIFF', 0); b.writeUInt32LE(836, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(800, 40)
  for (let i = 0; i < 800; i++) b[44 + i] = 128 + (i % 40)
  return [...b]
}
await c.h.evaluate(([p, w]) => window.api.haligtree('media:add', [{ name: 'Walden.pdf', bytes: new Uint8Array(p) }, { name: 'Voice.wav', bytes: new Uint8Array(w) }]), [pdfBytes('Walden'), wav()])
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
  // Files' tabs (All, Books, Pictures, Audio), by their chips, every pair of neighbours.
  ...[['All', 'Books'], ['Books', 'Pictures'], ['Pictures', 'Audio'], ['Audio', 'All']].map(([a, b]) => ({
    name: `Files ${a} to ${b} (tabs)`, view: 'media', a, b,
    pick: (one) => `[data-media-kinds] button:has-text("${one}")`,
    read: readKind
  })),
  // And by the piles on All, which open their kind as its tab does: from All, a pile is one step, and Back is All again.
  ...['pdf', 'picture', 'audio'].map((pile) => ({
    name: `Files All to ${pile} (pile)`, view: 'media', a: 'All', b: pile,
    act: async (one) => c.h.locator(one === 'All' ? '[data-media-kinds] button:has-text("All")' : `[data-pile="${one}"]`).first().click(),
    read: async () => ({ Books: 'pdf', Pictures: 'picture', Audio: 'audio', All: 'All' })[await readKind()] ?? ''
  })),
  {
    name: 'Stats', view: 'stats', a: 'Your month', b: 'Your year',
    // The app's one tab switch (tab-chips.tsx).
    pick: (one) => `[data-chips="stats"] [role=tab][aria-label="${one}"]`,
    read: () => c.h.evaluate(() => document.querySelector('[data-chips="stats"] [aria-selected="true"]')?.getAttribute('aria-label') ?? '')
  },
  {
    name: 'Settings', view: 'settings', a: 'Sound', b: 'Keys',
    pick: (one) => `[data-section="${one}"]`,
    read: () => c.h.evaluate(() => document.querySelector('[data-section][aria-current="page"]')?.getAttribute('data-section') ?? '')
  },
  {
    name: 'What Haligtree can do', view: 'powers', a: 'Remembering', b: 'Days and seasons',
    pick: (one) => `[data-section="${one}"]`,
    read: () => c.h.evaluate(() => document.querySelector('[data-powers-tab]')?.getAttribute('data-powers-tab') ?? '')
  },
  {
    // A tag's page: Read and Manage are steps, as Back finds them.
    name: 'Tag', view: 'tags', a: 'Manage', b: 'Read',
    enter: async () => { await c.h.locator('[data-tag-row]').first().click(); await wait(1200) },
    pick: (one) => `[data-list-tabs] button[aria-label="${one}"]`,
    read: () => c.h.evaluate(() => [...document.querySelectorAll('[data-list-tabs] button')].find((one) => one.getAttribute('aria-selected') === 'true' || one.getAttribute('aria-pressed') === 'true')?.getAttribute('aria-label') ?? '')
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
    if (place.enter) await place.enter()
    const choose = async (one) => {
      if (place.act) await place.act(one)
      else if (place.pick) await c.h.locator(place.pick(one)).first().click()
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

// Relaunched on Files: it opens on the kind its step kept (Audio, reached by a pile), and Back is All, then Pictures.
if (!process.env.ONLY || process.env.ONLY.includes('relaunch')) {
  try {
    await c.send('view', 'media')
    await wait(1200)
    await c.h.locator('[data-media-kinds] button:has-text("Pictures")').first().click()
    await wait()
    await c.h.locator('[data-media-kinds] button:has-text("All")').first().click()
    await wait()
    await c.h.locator('[data-pile="audio"]').click()
    await wait(1500)
    await c.close()
    c = await sandbox({ width: 1200, height: 800 })
    await wait(2000)
    const kind = await readKind()
    await key('Meta+BracketLeft')
    const back = await readKind()
    await key('Meta+BracketLeft')
    const again = await readKind()
    const ok = kind === 'Audio' && back === 'All' && again === 'Pictures'
    results.push({ name: 'relaunch Files', ok })
    console.log(`${ok ? 'PASS' : 'FAIL'}  relaunch Files: opens on ${kind || '(not on Files)'}, ⌘[ ${back}, ⌘[ ${again}`)
  } catch (error) {
    results.push({ name: 'relaunch Files', ok: false })
    console.log(`FAIL  relaunch Files  (${String(error.message ?? error).slice(0, 200)})`)
  }
}

await c.close()
const failed = results.filter((one) => !one.ok)
console.log(`\n${results.length - failed.length} of ${results.length} passed.`)
process.exit(failed.length ? 1 : 0)
