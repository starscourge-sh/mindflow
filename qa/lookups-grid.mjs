// Questions › Looked up (and Words) as a grid worth looking at, driven as a person would:
// - on every tile the word itself is the largest text and at least 15 px;
// - its meaning passes 4.5 to 1 against what is really behind it (measured on the pixels, the words hidden and shot again);
// - pointed at, a tile never shows its words twice (no caption over the words, no name following the pointer);
// - no icon repeated on every tile; a Lookup titled "Word: meaning" shows as the word, then its meaning;
// - at 0, 5, 159 and 1,000 Lookups: a true empty page, groups to scan by (no one group holding most of them), nothing sideways;
// - the list view and Words get the same care; Gems' and Writing's small grids never show their words twice on hover.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_SHOTS=dir node qa/lookups-grid.mjs
import { join } from 'path'
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS = ''
const { check, done } = checks()
const shots = process.env.QA_SHOTS
if (shots) mkdirSync(shots, { recursive: true })
const c = await sandbox({ width: 1200, height: 860, seeded: false })
const { h } = c
const call = (...args) => h.evaluate((args) => window.api.haligtree(...args), args)
const waitFor = async (test, ms = 8000) => { for (const end = Date.now() + ms; Date.now() < end; await h.waitForTimeout(150)) if (await test().catch(() => false)) return true; return false }
const both = async (name) => shots && c.both(join(shots, name))
const frames = async (name, act, n = 8) => { const run = act(); for (let at = 0; at < n; at++) { if (shots) await h.screenshot({ path: join(shots, `${name}-${String(at).padStart(2, '0')}.png`) }); await h.waitForTimeout(50) } await run }

const WORDS = ['Bereft', 'Sonder', 'Hiraeth', 'Petrichor', 'Apophenia', 'Anagnorisis', 'Sfumato', 'Chiaroscuro', 'Contrapposto', 'Liminal', 'Ephemeral', 'Sonorous', 'Quixotic', 'Mellifluous', 'Ineffable', 'Halcyon', 'Lachrymose', 'Peripatetic', 'Sesquipedalian', 'Defenestration', 'Zeitgeist', 'Weltschmerz', 'Saudade', 'Ubiquitous', 'Vellichor', 'Numinous', 'Obfuscate', 'Gossamer', 'Jejune', 'Kismet', 'Ennui', 'Yonder', 'Xenial', 'Raconteur', 'Tintinnabulation', 'Dulcet', 'Fernweh', 'Gloaming', 'Incandescent', 'Mamihlapinatapai']
const MEANING = (word) => `A meaning for ${word.toLowerCase()} that a reader wrote down, long enough to need a second line.`
const BOOKS = ['Frankenstein', 'The Odyssey', 'Middlemarch', 'Dune', '']
const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
/** n Lookups like a real book's: most a word with its meaning and its book, some titled "Word: meaning", a few asked, a few questions. */
async function seed(n) {
  const made = await h.evaluate(async ({ n, WORDS, BOOKS }) => {
    const out = []
    for (let i = 0; i < n; i++) {
      const word = WORDS[i % WORDS.length] + (i >= WORDS.length ? ` ${Math.floor(i / WORDS.length) + 1}` : '')
      const shape = i % 10 === 7 ? 'colon' : i % 10 === 9 ? (i % 20 === 9 ? 'question' : 'asked') : 'word'
      const meaning = `A meaning for ${word.toLowerCase()} that a reader wrote down, long enough to need a second line.`
      const title = shape === 'colon' ? `${word}: ${meaning}` : shape === 'question' ? `Why does ${word.toLowerCase()} sound so old?` : word
      const book = BOOKS[i % BOOKS.length]
      const id = await window.api.captures.create({ kind: 'word', title, body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }] }, markdown: title, ...(book ? { medium: book } : {}) })
      if (shape === 'word') await window.api.haligtree('notes:fields:set', 'captures', id, 'definition', meaning)
      out.push({ id, word: shape === 'question' ? title : word, meaning: shape === 'word' || shape === 'colon' ? meaning : null, shape })
    }
    return out
  }, { n, WORDS, BOOKS })
  // Spread over the year, as a reader's are: most of them months old.
  const months = 12
  for (let m = 0; m < months; m++) {
    const ids = made.filter((_, at) => at % months === m).map((one) => one.id)
    const when = new Date(Date.now() - (m === 0 ? 1 : m * 29) * 86400000).toISOString()
    if (ids.length) await call('captures:bulk', ids, { capturedAt: when })
  }
  return made
}
/** Display's size for the list, in whichever name it is kept under, then the page drawn afresh. */
async function density(name) {
  await h.evaluate((name) => { for (const key of ['view:captures:Questions', 'view:captures:Looked up', 'view:question', 'view:question:words']) { let had = {}; try { had = JSON.parse(localStorage.getItem(key) ?? '{}') } catch {} localStorage.setItem(key, JSON.stringify({ ...had, density: name })) } }, name)
}
async function looked() {
  await c.go('home')
  await c.go('lookups')
  await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-row]').length > 0 || !!document.querySelector('[data-empty], .mf-empty, [data-example]')))
  await h.waitForTimeout(600)
}
async function wordsTab() {
  await looked()
  const tab = await h.evaluateHandle(() => [...document.querySelectorAll('[data-question-filter] button')].find((one) => one.textContent.startsWith('WWoorrddss')))
  await tab.asElement().click()
  await h.waitForTimeout(1200)
  check('8. the Words tab is the one on show', await h.evaluate(() => /Words you are learning/.test(document.body.innerText)))
}
const tiles = (n = 12) => h.evaluate((n) => [...document.querySelectorAll('[data-row]')].filter((one) => { const r = one.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight }).slice(0, n).map((one) => one.dataset.id), n)

/** Every visible piece of text in a row: its words, size and box. */
const textsIn = (id) => h.evaluate((id) => {
  const row = document.querySelector(`[data-row][data-id="${CSS.escape(id)}"]`)
  if (!row) return []
  const seen = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) return false } return true }
  const out = []
  const walk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const text = node.textContent.trim()
    if (!text || !seen(node.parentElement)) continue
    const range = document.createRange(); range.selectNodeContents(node)
    const r = range.getBoundingClientRect()
    if (!r.width) continue
    out.push({ text, size: parseFloat(getComputedStyle(node.parentElement).fontSize), el: node.parentElement.dataset.headWord !== undefined ? 'word' : node.parentElement.closest('[data-head-meaning]') ? 'meaning' : '' })
  }
  return out
}, id)

/** The headword: the largest text, at least 15 px. */
async function headwordLargest(id, word) {
  const texts = await textsIn(id)
  const head = texts.find((one) => one.text === word)
  const biggest = Math.max(...texts.map((one) => one.size))
  return { ok: !!head && head.size >= 15 && head.size >= biggest, said: `${word}: ${head ? head.size : 'not shown alone'} px, largest ${biggest} px (${texts.map((one) => `${one.text.slice(0, 18)}@${one.size}`).join(' | ')})` }
}

/** The meaning's contrast on the real pixels: shot with its words, then with them hidden, against its ink. */
async function meaningContrast(id) {
  const box = await h.evaluate((id) => {
    const el = document.querySelector(`[data-row][data-id="${CSS.escape(id)}"] [data-head-meaning]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.max(1, r.width), height: Math.max(1, r.height), color: getComputedStyle(el).color }
  }, id)
  if (!box) return { ok: false, said: 'no meaning line on the tile' }
  await h.evaluate((id) => document.querySelector(`[data-row][data-id="${CSS.escape(id)}"] [data-head-meaning]`).style.setProperty('color', 'transparent', 'important'), id)
  const png = await h.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: box.height } })
  await h.evaluate((id) => document.querySelector(`[data-row][data-id="${CSS.escape(id)}"] [data-head-meaning]`).style.removeProperty('color'), id)
  const ratio = await h.evaluate(async ({ b64, color }) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode()
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, cv.width, cv.height).data
    const probe = document.createElement('canvas').getContext('2d'); probe.fillStyle = color; probe.fillRect(0, 0, 1, 1)
    const [tr, tg, tb, ta] = probe.getImageData(0, 0, 1, 1).data
    const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
    const out = []
    for (let i = 0; i < px.length; i += 16) {
      const a = ta / 255
      const L1 = lum(tr * a + px[i] * (1 - a), tg * a + px[i + 1] * (1 - a), tb * a + px[i + 2] * (1 - a))
      const L2 = lum(px[i], px[i + 1], px[i + 2])
      out.push((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05))
    }
    out.sort((a, b) => a - b)
    return out[Math.floor(out.length * 0.05)]
  }, { b64: png.toString('base64'), color: box.color })
  return { ok: ratio >= 4.5, said: `${ratio.toFixed(2)}:1` }
}

/** Pointed at: how many times the tile's own words show, anywhere on the page. */
async function hoverCopies(id, word) {
  await h.evaluate((id) => document.querySelector(`[data-row][data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }), id)
  await h.waitForTimeout(200)
  const at = await h.evaluate((id) => { const r = document.querySelector(`[data-row][data-id="${CSS.escape(id)}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, id)
  await h.mouse.move(at.x - 3, at.y - 3)
  await h.mouse.move(at.x, at.y, { steps: 3 })
  await h.waitForTimeout(450)
  const n = await h.evaluate((word) => {
    const seen = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) return false } return true }
    let n = 0
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (node.textContent.trim() !== word || !seen(node.parentElement)) continue
      const range = document.createRange(); range.selectNodeContents(node)
      const r = range.getBoundingClientRect()
      if (r.width && r.bottom > 0 && r.top < innerHeight) n++
    }
    return n
  }, word)
  return n
}

/** Whether every tile wears the same icon. */
const sameIconEverywhere = (ids) => h.evaluate((ids) => {
  const marks = ids.map((id) => [...document.querySelectorAll(`[data-row][data-id="${CSS.escape(id)}"] svg`)].map((svg) => svg.getAttribute('class') ?? '').filter((one) => !/size-1\.5|size-2\b/.test(one)).map((one) => one.split(' ').find((part) => part.startsWith('lucide-')) ?? 'svg').sort().join())
  return ids.length > 2 && marks.every((one) => one && one === marks[0]) ? marks[0] : ''
}, ids)

const groupsShown = () => h.evaluate(() => [...document.querySelectorAll('[data-group-head]')].map((one) => `${one.dataset.groupHead} ${one.dataset.groupCount ?? one.textContent.replace(one.dataset.groupHead, '').trim()}`))
const sideways = () => h.evaluate(() => [...document.querySelectorAll('.list-edge, main, [data-page]')].some((one) => one.scrollWidth > one.clientWidth + 1) || document.documentElement.scrollWidth > innerWidth + 1)

try {
  await call('onboarding:set', { welcomed: new Date().toISOString() })
  await h.reload()
  await h.waitForTimeout(1500)

  // 0. None at all: the page says what it holds and how a word gets here.
  await looked()
  const empty = await h.evaluate(() => document.querySelector('main')?.innerText ?? document.body.innerText)
  check('0. with no Lookups, the page says how a word gets here', /look a word up|pick Word|looked up/i.test(empty) && !/catch a thought/i.test(empty), empty.replace(/\s+/g, ' ').slice(0, 160))
  await both('scale-0')

  // 5 Lookups.
  let made = await seed(5)
  await looked()
  check('5. five Lookups show as five tiles', (await h.evaluate(() => document.querySelectorAll('[data-row]').length)) === 5)
  await both('scale-5')

  // 159, as in the user's book.
  made = [...made, ...(await seed(154))]
  const byId = new Map(made.map((one) => [one.id, one]))
  for (const size of ['small', 'grid', 'list']) {
    await density(size)
    await looked()
    const ids = await tiles(12)
    const words = ids.map((id) => byId.get(id)).filter(Boolean)
    const heads = await Promise.all(words.map((one) => headwordLargest(one.id, one.word)))
    check(`1. ${size}: the word is the largest text on every tile, at least 15 px`, heads.length > 5 && heads.every((one) => one.ok), heads.find((one) => !one.ok)?.said ?? heads[0]?.said)
    const withMeaning = words.filter((one) => one.meaning).slice(0, 4)
    for (const name of ['light', 'dark']) {
      await c.look(name)
      const said = []
      for (const one of withMeaning) said.push(await meaningContrast(one.id))
      check(`2. ${size}, ${name}: every meaning passes 4.5 to 1 on the pixels behind it`, said.length > 0 && said.every((one) => one.ok), said.map((one) => one.said).join(', '))
    }
    await c.look('light')
    const colon = words.find((one) => one.shape === 'colon') ?? made.find((one) => one.shape === 'colon')
    await h.evaluate((id) => document.querySelector(`[data-row][data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }), colon.id)
    await h.waitForTimeout(300)
    const colonTexts = await textsIn(colon.id)
    check(`5. ${size}: a Lookup titled "Word: meaning" shows the word alone, then its meaning`, colonTexts.some((one) => one.text === colon.word) && colonTexts.some((one) => one.el === 'meaning' && one.text.startsWith(colon.meaning.slice(0, 20))), colonTexts.map((one) => one.text.slice(0, 30)).join(' | '))
    const icon = await sameIconEverywhere(ids)
    check(`4. ${size}: no icon repeated on every tile`, !icon, icon)
    await h.evaluate((id) => document.querySelector(`[data-row][data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' }), ids[0])
    await h.waitForTimeout(300)
    const boxesBefore = await h.evaluate(() => [...document.querySelectorAll('[data-row]')].slice(0, 8).map((one) => { const r = one.getBoundingClientRect(); return `${r.x},${r.y},${r.width},${r.height}` }).join(' '))
    const first = byId.get(ids[0])
    await frames(`hover-${size}`, () => hoverCopies(first.id, first.word), 8)
    const copies = await hoverCopies(first.id, first.word)
    check(`3. ${size}: pointed at, the word shows once`, copies === 1, `${first.word} shows ${copies} times`)
    const boxesAfter = await h.evaluate(() => [...document.querySelectorAll('[data-row]')].slice(0, 8).map((one) => { const r = one.getBoundingClientRect(); return `${r.x},${r.y},${r.width},${r.height}` }).join(' '))
    check(`3. ${size}: pointing moves nothing`, boxesBefore === boxesAfter)
    await both(`looked-${size}-hover`)
    await h.mouse.move(5, 300)
    const heads159 = await groupsShown()
    const biggest = Math.max(0, ...heads159.map((one) => Number(one.match(/(\d[\d,]*)\s*$/)?.[1]?.replace(/,/g, '') ?? 0)))
    check(`6. ${size}: 159 Lookups have something to scan by (no group holds most of them)`, heads159.length >= 2 && biggest <= 159 * 0.4, `${heads159.length} groups: ${heads159.slice(0, 6).join(', ')}`)
    check(`6. ${size}: nothing scrolls sideways`, !(await sideways()))
    await both(`looked-${size}`)
  }

  // The phone's width: nothing cut off, nothing sideways.
  await density('small')
  await c.size(390, 844)
  await looked()
  check('7. at 390 px wide nothing scrolls sideways', !(await sideways()))
  const narrow = await tiles(4)
  const narrowHead = narrow[0] && byId.get(narrow[0]) ? await headwordLargest(narrow[0], byId.get(narrow[0]).word) : { ok: false, said: 'no tile' }
  check('7. at 390 px the word still leads its tile', narrowHead.ok, narrowHead.said)
  await both('looked-phone')
  await c.size(1200, 860)

  // Words: the same care.
  // A word is kept as a gem with its meaning on its first line ("Word: meaning"), as the app asks.
  for (const one of made.filter((one) => one.shape === 'colon').slice(0, 12)) await call('promote', one.id)
  for (const size of ['small', 'list']) {
    await density(size)
    await wordsTab()
    const ids = await tiles(8)
    const words = await h.evaluate((ids) => ids.map((id) => document.querySelector(`[data-row][data-id="${CSS.escape(id)}"] [data-head-word]`)?.textContent ?? ''), ids)
    const heads = []
    for (const [at, id] of ids.entries()) heads.push(words[at] ? await headwordLargest(id, words[at]) : { ok: false, said: 'no headword on the tile' })
    check(`8. Words ${size}: the word leads every tile, at least 15 px`, heads.length > 3 && heads.every((one) => one.ok), heads.find((one) => !one.ok)?.said ?? heads[0]?.said)
    const icon = await sameIconEverywhere(ids)
    check(`8. Words ${size}: no icon repeated on every tile`, !icon, icon)
    if (ids[0] && words[0]) check(`8. Words ${size}: pointed at, the word shows once`, (await hoverCopies(ids[0], words[0])) === 1)
    await h.mouse.move(5, 300)
    await both(`words-${size}`)
  }

  // The sweep: every grid sharing the tile. Gems' small grid, Writing's grid and Open questions' cards say their words once when pointed at, never under 11 px.
  const gemNote = await h.evaluate(() => window.api.captures.create({ kind: 'note', title: 'Memory cannot retain them all', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Memory cannot retain them all' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Leonardo, on why his notebooks repeat themselves.' }] }] } }))
  await call('promote', gemNote)
  const page = await call('article:new')
  await call('item:save', page, { title: 'Why Victor never names his creature' })
  await call('question:new', 'Why does Sunday evening feel heavy?')
  for (const [where, key, title, size] of [['nuggets', 'view:nugget', 'Memory cannot retain them all', 'small'], ['nuggets', 'view:nugget', 'Memory cannot retain them all', 'grid'], ['articles', 'view:article', 'Why Victor never names his creature', 'small'], ['articles', 'view:article', 'Why Victor never names his creature', 'grid'], ['questions', 'view:question', 'Why does Sunday evening feel heavy?', 'small']]) {
    await h.evaluate(([key, size]) => { let had = {}; try { had = JSON.parse(localStorage.getItem(key) ?? '{}') } catch {} localStorage.setItem(key, JSON.stringify({ ...had, density: size })) }, [key, size])
    await c.go('home')
    await c.go(where)
    await waitFor(() => h.evaluate(() => document.querySelectorAll('[data-row]').length > 0))
    await h.waitForTimeout(800)
    const id = await h.evaluate((title) => [...document.querySelectorAll('[data-row]')].find((one) => one.textContent.includes(title.slice(0, 20)))?.dataset.id, title)
    if (!id) { check(`10. ${where} ${size}: the tile is there`, false); continue }
    const smallest = Math.min(...(await textsIn(id)).map((one) => one.size))
    check(`10. ${where} ${size}: no words on a tile under 11 px`, smallest >= 11, `${smallest} px`)
    const copies = await hoverCopies(id, (await textsIn(id)).find((one) => title.startsWith(one.text.slice(0, 12)))?.text ?? title)
    check(`10. ${where} ${size}: pointed at, its words show once`, copies === 1, `${copies} times`)
    await both(`sweep-${where}-${size}-hover`)
    await h.mouse.move(5, 300)
  }

  // 1,000: still drawn only in view, groups to scan by, nothing sideways.
  await density('small')
  await seed(841)
  await looked()
  const drawn = await h.evaluate(() => document.querySelectorAll('[data-row]').length)
  check('9. 1,000 Lookups draw only what is in view', drawn > 0 && drawn < 300, String(drawn))
  check('9. 1,000 Lookups: nothing scrolls sideways', !(await sideways()))
  const heads1000 = await groupsShown()
  check('9. 1,000 Lookups are grouped to scan by', heads1000.length >= 2, heads1000.slice(0, 4).join(', '))
  await both('scale-1000')
} finally {
  await c.close()
}
done()
