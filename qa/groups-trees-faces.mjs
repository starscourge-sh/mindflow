// Four looks the user flagged on 9 Nov, measured and pictured light and dark:
// - Writing: two group panels in a row stand 10 to 18px apart, and the last one as far from the loose row under it.
// - Review's deck List: a sub-deck ("Painters" > "Leonardo") hangs off the same connected branch as the sidebar's
//   trees: the trunk runs from under its parent's row down to the twig, the same distance in as the sidebar's.
// - An @mention of a person with no photo wears a round chip as big as a photo face, with one letter you can read.
// - A link to a character (and a name kept as a person, "Gandalf, in J.R.R. Tolkien") says "Character" on its hover
//   card, with the work, never "Person".
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 [SHOT=<dir>] node qa/groups-trees-faces.mjs
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
const SHOT = process.env.SHOT
const c = await sandbox({ width: 1300, height: 900 })
const { h, v, go, send } = c
const wait = (ms) => h.waitForTimeout(ms)
const both = async (name, clip) => {
  if (!SHOT) return
  for (const theme of ['light', 'dark']) {
    await h.evaluate((n) => { localStorage.setItem('theme', n === 'light' ? 'paper' : n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) }, theme)
    await wait(600)
    const box = typeof clip === 'string' ? await h.locator(clip).first().boundingBox() : clip
    await h.screenshot({ path: `${SHOT}/${name}-${theme}.png`, ...(box ? { clip: { x: Math.max(0, box.x - 16), y: Math.max(0, box.y - 16), width: box.width + 32, height: Math.min(700, box.height + 32) } } : {}) })
  }
  await h.evaluate(() => { localStorage.setItem('theme', 'paper'); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })) })
  await wait(300)
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  await h.evaluate(() => window.api.haligtree('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, welcoming: false, pageHints: false }))

  // --- Writing: two groups, then the loose rows ---------------------------------------------------
  await h.evaluate(() => localStorage.setItem('view:article', JSON.stringify({ sort: 'manual', group: 'none', filter: {}, density: 'list' })))
  const before = await v('groups', 'article')
  const inFolders = new Set(before.flatMap((one) => one.members))
  const made = []
  for (const title of ['Gap one', 'Gap two', 'Gap three', 'Gap four']) { const id = await v('article:new'); await v('item:save', id, { title }); made.push(id) }
  const loose = (await v('items', 'article')).filter((one) => !inFolders.has(one.id) && !made.includes(one.id) && !one.archivedAt).map((one) => one.id)
  const groups = Object.fromEntries(before.map((one) => [one.id, one.members]))
  await v('groups:arrange', 'article', { top: ['g:qa-gap-a', 'g:qa-gap-b', ...loose, ...before.filter((one) => !one.parent).map((one) => `g:${one.id}`)], groups: { ...groups, 'qa-gap-a': made.slice(0, 2) }, make: { id: 'qa-gap-a', name: 'First group' } })
  await v('groups:arrange', 'article', { top: ['g:qa-gap-a', 'g:qa-gap-b', ...loose, ...before.filter((one) => !one.parent).map((one) => `g:${one.id}`)], groups: { ...groups, 'qa-gap-a': made.slice(0, 2), 'qa-gap-b': made.slice(2) }, make: { id: 'qa-gap-b', name: 'Second group' } })
  await go('home'); await go('articles'); await wait(1200)
  const gaps = await h.evaluate(() => {
    const panel = (id) => document.querySelector(`[role="main"] [data-group-block="${id}"]`)?.getBoundingClientRect()
    const a = panel('qa-gap-a'), b = panel('qa-gap-b')
    const rows = [...document.querySelectorAll('[role="main"] [data-sortable-id]:not([data-sortable-id^="g:"])')].map((one) => one.getBoundingClientRect()).filter((r) => b && r.top >= b.bottom - 1).sort((x, y) => x.top - y.top)
    return a && b ? { between: Math.round(b.top - a.bottom), below: rows[0] ? Math.round(rows[0].top - b.bottom) : null } : null
  })
  console.log('  Writing gaps:', JSON.stringify(gaps))
  check('Writing: two group panels in a row stand 10 to 18px apart', !!gaps && gaps.between >= 10 && gaps.between <= 18, JSON.stringify(gaps))
  check('Writing: the last group stands as far from the loose row under it', !!gaps && gaps.below !== null && Math.abs(gaps.below - gaps.between) <= 2, JSON.stringify(gaps))
  const list = await h.evaluate(() => { const a = document.querySelector('[role="main"] [data-group-block="qa-gap-a"]')?.getBoundingClientRect(); return a && { x: a.x, y: a.y, width: a.width, height: 300 } })
  await both('writing-groups', list)

  // --- the sidebar's tree, and Review's deck List --------------------------------------------------
  const trunk = (root) => h.evaluate((root) => {
    const svg = document.querySelector(`${root} svg path[stroke]`)?.closest('svg')
    if (!svg) return null
    const box = svg.parentElement.getBoundingClientRect()
    const parentRow = svg.parentElement.parentElement?.previousElementSibling?.getBoundingClientRect() ?? null
    const d = svg.querySelector('path').getAttribute('d')
    return { x: Math.round(box.left - 4.5), top: Math.round(box.top), parentBottom: parentRow ? Math.round(parentRow.bottom) : null, d }
  }, root)
  await h.evaluate(() => localStorage.setItem('haligtree:deck-look', 'list'))
  await go('review'); await wait(800)
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click()); await wait(1200)
  // Where the trunk runs against the fold arrow of the deck above, and how far a twig's end is from the words of its row.
  const deck = await h.evaluate(() => {
    const list = document.querySelector('[data-deck-list]')
    const svg = list?.querySelector('svg.pointer-events-none.absolute')
    if (!svg) return { has: false }
    const box = svg.getBoundingClientRect()
    const parent = svg.parentElement.parentElement.previousElementSibling
    const arrow = parent?.querySelector('[data-deck-fold-kids]')?.getBoundingClientRect()
    const child = svg.parentElement.querySelector('[data-deck-row]')
    const name = child?.querySelector('[data-deck-row-study], span.line-clamp-2')
    const range = document.createRange(); if (name) range.selectNodeContents(name)
    const words = name ? range.getBoundingClientRect() : null
    return { has: true, trunkX: Math.round((box.left - 4.5) * 10) / 10, arrowMid: arrow ? Math.round((arrow.left + arrow.width / 2) * 10) / 10 : null, trunkTop: Math.round(box.top), parentBottom: parent ? Math.round(parent.getBoundingClientRect().bottom) : null, twigToWords: words ? Math.round(words.left - (box.left + 5)) : null }
  })
  console.log('  deck list branches:', JSON.stringify(deck))
  check('Review deck List: the trunk runs down from under the fold arrow of the deck above (within 1.5px)', deck.has && deck.arrowMid !== null && Math.abs(deck.trunkX - deck.arrowMid) <= 1.5, JSON.stringify(deck))
  check('Review deck List: a twig ends near its row\'s name (12px or less), as the sidebar\'s meet their icon', deck.has && deck.twigToWords !== null && deck.twigToWords <= 12, JSON.stringify(deck))
  await both('deck-list', '[data-deck-list]')
  await go('articles'); await wait(800)
  await both('sidebar-tree', '[data-side-folders]')

  // --- @mention faces -----------------------------------------------------------------------------
  const doc = (...nodes) => ({ type: 'doc', content: [{ type: 'paragraph', content: nodes }] })
  await h.evaluate(() => window.api.captures.create({ attribution: 'J.R.R. Tolkien', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Not all those who wander are lost.' }] }] } }))
  const note = await h.evaluate((d) => window.api.captures.create({ body: d }), doc(
    { type: 'text', text: 'Read ' }, { type: 'noteLink', attrs: { id: 'person:Oscar Wilde', label: 'Oscar Wilde' } },
    { type: 'text', text: ' beside ' }, { type: 'noteLink', attrs: { id: 'person:Mary Shelley', label: 'Mary Shelley' } },
    { type: 'text', text: ', then ' }, { type: 'noteLink', attrs: { id: 'character:Gandalf', label: 'Gandalf' } },
    { type: 'text', text: ' and ' }, { type: 'noteLink', attrs: { id: 'person:Gandalf, in J.R.R. Tolkien', label: 'Gandalf, in J.R.R. Tolkien' } }))
  await send('capture', note); await wait(1800)
  const faces = await h.evaluate(() => [...document.querySelectorAll('.ProseMirror a[data-note^="person:"] .mf-avatar, .ProseMirror a[data-note^="character:"] .mf-avatar')].map((one) => {
    const r = one.getBoundingClientRect(), s = getComputedStyle(one), letters = one.querySelector(':scope > span')
    return { who: one.closest('a').dataset.note, kind: one.dataset.avatar, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, radius: s.borderRadius, shape: getComputedStyle(one.querySelector('.mf-avatar-shape') ?? one).display, letters: letters?.textContent ?? '', font: letters ? parseFloat(getComputedStyle(letters).fontSize) : 0 }
  }))
  console.log('  faces:', JSON.stringify(faces))
  const wilde = faces.find((one) => one.who === 'person:Oscar Wilde'), shelley = faces.find((one) => one.who === 'person:Mary Shelley')
  check('a mention with no photo is a round chip, no shape', !!wilde && wilde.radius !== '0px' && wilde.shape === 'none', JSON.stringify(wilde))
  check('it is as big as a photo face beside it', !!wilde && !!shelley && Math.abs(wilde.w - shelley.w) < 0.6 && Math.abs(wilde.h - shelley.h) < 0.6, JSON.stringify([wilde, shelley]))
  check('its letters read: one letter, 9px or more', !!wilde && wilde.letters === 'O' && wilde.font >= 9, JSON.stringify(wilde))
  // Each face sits inside its chip, its left as far in as the chip's padding, its middle on the words' x-height middle,
  // at the note's own text size and a size up and down.
  const seat = () => h.evaluate(() => [...document.querySelectorAll('.ProseMirror a[data-note^="person:"], .ProseMirror a[data-note^="character:"]')].map((link) => {
    const face = link.querySelector('.mf-avatar')?.getBoundingClientRect()
    if (!face) return { who: link.dataset.note, face: false }
    const chip = [...link.getClientRects()].find((r) => r.left <= face.left + 1 && r.right >= face.right - 1 && r.top <= face.bottom && r.bottom >= face.top) ?? link.getBoundingClientRect()
    const mark = document.createElement('span')
    mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:middle'
    const words = link.querySelector('span:not(.tiptap-note-link-icon):not(.mf-avatar)') ?? link
    words.prepend(mark)
    const middle = mark.getBoundingClientRect().top
    mark.remove()
    const pad = parseFloat(getComputedStyle(link).paddingLeft)
    return { who: link.dataset.note, inLeft: Math.round((face.left - chip.left) * 10) / 10, pad, above: Math.round((chip.top - face.top) * 10) / 10, below: Math.round((face.bottom - chip.bottom) * 10) / 10, offMiddle: Math.round(((face.top + face.bottom) / 2 - middle) * 10) / 10, bg: getComputedStyle(link.querySelector('.mf-avatar')).backgroundColor }
  }))
  const seated = (all) => all.every((one) => one.face !== false && Math.abs(one.inLeft - one.pad) <= 1 && one.above <= 1 && one.below <= 1 && Math.abs(one.offMiddle) <= 1)
  const atRest = await seat()
  console.log('  faces in chips:', JSON.stringify(atRest))
  check('every face sits inside its chip, in by the chip\'s padding, centred on the x-height (photo and initials)', seated(atRest), JSON.stringify(atRest))
  // The note's words a size up and down (⌥⌘+ and ⌥⌘−), and the whole app (⌘+ and ⌘−).
  for (const [set, said] of [[{ textSize: 1.3 }, 'the text a size up'], [{ textSize: 0.85 }, 'the text a size down'], [{ interfaceSize: 130 }, 'the app at 130%'], [{ interfaceSize: 85 }, 'the app at 85%']]) {
    await v('settings:set', set); await wait(900)
    const now = await seat()
    check(`and with ${said}`, seated(now), JSON.stringify(now))
    if (said === 'the text a size up') await both('mention-line-bigger', await h.evaluate(() => { const p = document.querySelector('.ProseMirror a[data-note="person:Oscar Wilde"]')?.closest('p')?.getBoundingClientRect(); return p && { x: p.x, y: p.y, width: Math.min(p.width, 900), height: p.height } }))
    await v('settings:set', { textSize: 1, interfaceSize: 100 }); await wait(600)
  }
  await both('mention-faces', '.ProseMirror a[data-note="person:Oscar Wilde"]')
  const line = await h.evaluate(() => { const p = document.querySelector('.ProseMirror a[data-note="person:Oscar Wilde"]')?.closest('p')?.getBoundingClientRect(); return p && { x: p.x, y: p.y, width: Math.min(p.width, 820), height: p.height } })
  await both('mention-line', line)

  // --- hover cards ---------------------------------------------------------------------------------
  const hover = async (id) => {
    await h.mouse.move(5, 5); await wait(500)
    // A link that wraps has two boxes: aim at its last line's, the words, not the gap between the lines.
    const box = await h.evaluate((id) => { const all = [...document.querySelector(`.ProseMirror a[data-note="${CSS.escape(id)}"]`).getClientRects()]; const r = all.at(-1); return { x: r.x, y: r.y, width: r.width, height: r.height } }, id)
    await h.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
    for (let i = 0; i < 20; i++) { await wait(150); const said = await h.evaluate(() => document.querySelector('[data-preview-kind]')?.textContent?.trim() ?? ''); if (said) break }
    await wait(300)
    return h.evaluate(() => { const kind = document.querySelector('[data-preview-kind]'); const card = kind?.parentElement; return { kind: kind?.textContent?.trim() ?? '', text: card?.innerText.replace(/\s+/g, ' ').slice(0, 140) ?? '' } })
  }
  const real = await hover('person:Mary Shelley')
  check('a real person still says "Person"', real.kind === 'Person', JSON.stringify(real))
  const gandalf = await hover('character:Gandalf')
  check('a character link\'s card says "Character" and the work', gandalf.kind === 'Character' && /Fellowship of the Ring/.test(gandalf.text), JSON.stringify(gandalf))
  if (SHOT) await h.screenshot({ path: `${SHOT}/hover-character-light.png` })
  const named = await hover('person:Gandalf, in J.R.R. Tolkien')
  check('"Gandalf, in J.R.R. Tolkien" kept as a person reads as a character by Tolkien', named.kind === 'Character' && /character by J\.R\.R\. Tolkien/.test(named.text), JSON.stringify(named))
  if (SHOT) await h.screenshot({ path: `${SHOT}/hover-named-light.png` })
  check('no page errors', c.errors.filter((one) => /PAGEERROR/.test(one)).length === 0, c.errors.join(' | '))
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
