// Two looks for anything shown on hover, and one at a time. Hovers each kind
// in the Feed (a reaction's tip, a person's name, a tag, the latest thought
// under a post, a face in "Your sources", a title tip) and checks that:
//   - exactly one floating thing shows (never a tip and a card at once);
//   - its surface (background, corner radius, shadow) is the card's (the @
//     link's, note-preview.tsx) or the Tip's (ui.tsx), so a new odd popup fails;
//   - a card stays whole inside the window, as wide as the note card.
// A thought's card reads as the note card does: "Thought", its date, its words, its note.
//
//   npx electron-vite build --outDir out-x
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/popups-consistent.mjs
// SHOTS=<folder> keeps a light and a dark picture of each.
import { mkdtempSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

process.env.QA_DATA ??= mkdtempSync(join(tmpdir(), 'haligtree-popups-'))
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
const c = await sandbox({ width: 1600, height: 1000 })
const { v, h, go } = c
const wait = (ms) => h.waitForTimeout(ms)
// Light is the theme it opened in (Paper), not some other light one.
let first = null
const paintAs = (name) => h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); document.documentElement.classList.toggle('dark', n === 'dark') }, name)
const paint = async (name) => { first ??= await h.evaluate(() => localStorage.getItem('theme') ?? 'paper'); return paintAs(name === 'light' ? first : name) }

// Everything that floats on hover, by its own mark.
const FLOATS = '[data-note-preview], [data-slot="tooltip-content"], [data-title-tips], [data-pdf-peek-card], [data-map-tip], [data-token-hint]'
const shown = () => h.evaluate((sel) => [...document.querySelectorAll(sel)].filter((one) => {
  const r = one.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && Number(getComputedStyle(one).opacity) > 0.05 && one.getAttribute('data-state') !== 'closed'
}).map((one) => {
  const s = getComputedStyle(one)
  const r = one.getBoundingClientRect()
  return { mark: one.getAttributeNames().find((name) => name.startsWith('data-') && name !== 'data-state' && name !== 'data-side' && name !== 'data-align' && name !== 'data-private') ?? '', bg: s.backgroundColor, radius: s.borderTopLeftRadius, shadow: s.boxShadow, box: [r.left, r.top, r.right, r.bottom].map(Math.round), width: Math.round(r.width), text: one.innerText.slice(0, 80) }
}), FLOATS)

const rest = async (locator) => {
  await h.mouse.move(5, 500)
  await wait(700)
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  await h.mouse.move(box.x - 20, box.y - 20)
  await h.mouse.move(box.x + Math.min(6, box.width / 2), box.y + box.height / 2, { steps: 4 })
  await wait(1200)
}

try {
  const feed = await v('feed')
  const replied = feed.posts.find((one) => one.replies >= 1)
  check('a post in the Feed has a thought', !!replied)
  // A note whose label and first line differ ("PER - On discipline" under "On discipline"), each paragraph its own line.
  await go('feed')
  await wait(1500)

  const kinds = [
    ['tip', 'a reaction button', h.locator('[data-feed-post] [data-slot="tooltip-trigger"]').first()],
    ['card', 'a person\'s name', h.locator('[data-feed-account]').first()],
    ['card', 'a tag', h.locator('[data-feed-tag]').first()],
    ['card', 'the latest thought under a post', h.locator('[data-feed-latest]').first()],
    ['card', 'a face in "Your sources"', h.locator('[data-feed-face]').first()],
    ['tip', 'a title tip', null]
  ]
  const refs = {}
  for (const [want, name, at] of kinds) {
    let target = at
    if (!target) {
      // A plain title anywhere, as any control may carry one.
      await h.evaluate(() => { const b = Object.assign(document.createElement('button'), { title: 'A plain title', textContent: 'T' }); b.setAttribute('data-qa-title', ''); Object.assign(b.style, { position: 'fixed', left: '400px', top: '300px', zIndex: 5 }); document.body.append(b) })
      target = h.locator('[data-qa-title]')
    }
    if (!(await target.count())) { check(`${name}: on the page`, false); continue }
    await rest(target)
    const now = await shown()
    check(`${name}: one thing shows`, now.length === 1, now.map((one) => `${one.mark}: ${one.text.replace(/\n/g, ' / ')}`).join(' | '))
    const one = now[0]
    if (!one) continue
    refs[want] ??= one
    const ref = refs[want]
    check(`${name}: the ${want}'s surface`, one.bg === ref.bg && one.radius === ref.radius && one.shadow === ref.shadow, `${one.bg} ${one.radius} ${one.shadow.slice(0, 60)}`)
    if (want === 'card') {
      const [w, hgt] = await h.evaluate(() => [innerWidth, innerHeight])
      check(`${name}: whole inside the window`, one.box[0] >= 8 && one.box[1] >= 8 && one.box[2] <= w - 8 && one.box[3] <= hgt - 8, one.box.join(','))
      check(`${name}: the note card's width`, Math.abs(one.width - refs.card.width) <= 2, `${one.width} vs ${refs.card.width}`)
    }
    if (name.startsWith('the latest thought')) {
      const kind = await h.locator('[data-note-preview] [data-preview-kind]').innerText().catch(() => '')
      check('the thought\'s card says "Thought" and its date', /^Thought/.test(kind) && kind.length > 10, kind)
      check('and the note it is on, under a hairline', (await h.locator('[data-note-preview] [data-preview-on]').count()) === 1)
    }
    if (name.startsWith('a face')) {
      const said = await h.locator('[data-note-preview]').innerText().catch(() => '')
      check('the face\'s card says how many notes, as its tip did', /\d+ notes?/.test(said), said.replace(/\n+/g, ' / '))
      check('its picture is small, beside the title', await h.locator('[data-note-preview] [data-preview-image]').evaluate((img) => img.getBoundingClientRect().height <= 48).catch(() => true))
    }
    if (SHOTS) {
      for (const theme of ['light', 'dark']) {
        await paint(theme)
        await rest(target)
        const r = (await shown())[0]?.box ?? one.box
        const t = (await target.boundingBox()) ?? { x: r[0], y: r[1], width: 0, height: 0 }
        const x0 = Math.max(0, Math.min(r[0], t.x) - 24)
        const y0 = Math.max(0, Math.min(r[1], t.y) - 24)
        await h.screenshot({ path: `${SHOTS}/${name.replace(/[^a-z]+/gi, '-').replace(/^-|-$/g, '')}-${theme}.png`, clip: { x: x0, y: y0, width: Math.min(1600 - x0, Math.max(r[2], t.x + t.width) - x0 + 24), height: Math.min(1000 - y0, Math.max(r[3], t.y + t.height) - y0 + 24) } })
      }
      await paint('light')
    }
  }
  // The note card's words: the title not said twice, and each paragraph on its own line.
  const note = feed.posts.find((one) => one.type === 'nugget' && one.id !== replied?.id)
  const title = 'On discipline and operating principles'
  await v('item:save', note.id, { title, body: { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: `PER - ${title}` }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'The day-to-day.' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph.' }] }
  ] } })
  await h.evaluate((id) => { const s = Object.assign(document.createElement('span'), { textContent: 'a note' }); s.setAttribute('data-note-hover', ''); s.setAttribute('data-note', `nugget:${id}`); s.setAttribute('data-qa-note', ''); Object.assign(s.style, { position: 'fixed', left: '400px', top: '200px', zIndex: 5 }); document.body.append(s) }, note.id)
  await rest(h.locator('[data-qa-note]'))
  const words = await h.locator('[data-note-preview] [data-preview-text]').innerText().catch(() => '')
  check('the card\'s words do not say the title again', !words.includes(title), JSON.stringify(words))
  check('its paragraphs keep their breaks', /day-to-day\.\nSecond/.test(words), JSON.stringify(words))
  const errors = c.errors?.slice?.(0, 5) ?? []
  check('no errors on the page', !errors.length, errors.join(' | '))
} catch (error) {
  console.log('FAIL  probe stopped:', error.message)
  results.push(false)
} finally {
  await c.close()
}
const passed = results.filter(Boolean).length
console.log(`\n${passed} of ${results.length} passed`)
process.exit(passed === results.length ? 0 : 1)
