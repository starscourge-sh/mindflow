// Files, walked as a person (an Anki and Obsidian user with taste) on a copy of a real book: in from the sidebar,
// every tab the book has, its count against the files it holds, the hand over everything a click does something to,
// Books' "Continue reading" saying where you are and when you mean to finish as two parts, never run together,
// Table, and on Images: a right-click, ⌘A and the menu on what is picked, Esc, search with nothing found.
//   QA_DATA=<a copy of a book> QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/files-walk.mjs [shots]
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.argv[2]
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const c = await sandbox({ width: 1300, height: 860 })
const { h, go, v, both } = c
const wait = (ms) => h.waitForTimeout(ms)
const shot = async (name) => SHOTS && both(join(SHOTS, name))
const waitFor = async (test, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await test()) return true; await wait(150) } return false }

/** Everything on the page a click does something to, without the hand (a wrapper that only stops a press is left out). */
const noHand = (scope) => h.evaluate((scope) => {
  const root = document.querySelector(scope)?.closest('section') ?? document.querySelector(scope)
  const out = []
  for (const el of root?.querySelectorAll('*') ?? []) {
    const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'))
    const props = key && el[key]
    if (!props?.onClick || /stopPropagation\(\)\s*$/.test(String(props.onClick).replace(/[\s};)]+$/, ')'))) continue
    // A tip's trigger closes its tip on a press (nothing of its own), and a row of chips passes a press in a gap to the chip lit beside it (glide.tsx): neither is a control.
    if (el.matches('[data-slot$="trigger"]:not(button, [role="button"]), [data-hover-quiet]')) continue
    const box = el.getBoundingClientRect()
    if (box.width < 1 || box.height < 1 || box.bottom < 0 || box.top > innerHeight) continue
    const cursor = getComputedStyle(el).cursor
    if (cursor !== 'pointer' && cursor !== 'text') out.push(`${el.tagName.toLowerCase()}${[...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}]`).join('')} "${(el.textContent ?? '').trim().slice(0, 30)}" ${cursor}`)
  }
  return out
}, scope)

const countSaid = () => h.evaluate(() => document.querySelector('[data-list-count]')?.textContent.trim() ?? '')
const chips = () => h.$$eval('[data-media-kinds] button', (all) => all.map((one) => one.textContent.replace(/\s+/g, ' ').trim()))
const chip = async (label) => { await h.locator('[data-media-kinds] button', { hasText: new RegExp(`^${label}`) }).first().click(); await wait(700) }
const menuRows = () => h.$$eval('[role="menu"] [role="menuitem"]', (all) => all.map((one) => one.textContent.replace(/\s+/g, ' ').trim()))

/**
 * QA_WALK=looks: Files and Review in each shape style (Soft, Paper, Brutal) and at the smallest and largest App size,
 * light and dark: nothing runs sideways out of the page, no label on the line is cut short, frames kept for the eye.
 */
async function looks() {
  const styled = async (style) => { await h.evaluate((style) => { localStorage.setItem('style', style); window.dispatchEvent(new StorageEvent('storage', { key: 'style' })) }, style); await wait(500) }
  const fit = () => h.evaluate(() => {
    const header = [...document.querySelectorAll('section > header')].find((one) => one.getBoundingClientRect().width > 300 && one.offsetParent)
    const cut = header ? [...header.querySelectorAll('button, [data-list-count], [role="tab"]')].filter((one) => one.offsetParent && one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent.trim().slice(0, 30)) : []
    return { sideways: document.documentElement.scrollWidth > innerWidth + 1, cut }
  })
  for (const [style, size] of [['soft', 80], ['soft', 150], ['paper', 100], ['brutal', 100]]) {
    await styled(style)
    await v('settings:set', { interfaceSize: size })
    await wait(700)
    for (const [page, view, then] of [['files-books', 'media', 'Books'], ['files-images', 'media', 'Images'], ['review-decks', 'review', null]]) {
      await go(view); await wait(1100)
      if (then) await h.locator('[data-media-kinds] button', { hasText: new RegExp(`^${then}`) }).first().click().catch(() => {})
      await wait(800)
      const now = await fit()
      check(`${page}, ${style} at ${size}%: nothing runs sideways, nothing on the line cut short`, !now.sideways && !now.cut.length, JSON.stringify(now))
      await shot(`look-${page}-${style}-${size}`)
    }
  }
  await styled('soft')
  await v('settings:set', { interfaceSize: 100 })
}

try {
  await v('settings:set', { sounds: false, hintRate: 0 })
  if (process.env.QA_WALK === 'looks') {
    await looks()
    check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
    await c.close()
    done()
  }
  const all = await v('media:list')
  const shelfOf = (one) => (one.kind === 'gif' ? 'picture' : one.kind)
  const by = {}
  for (const one of all) if (!one.deck) by[shelfOf(one)] = (by[shelfOf(one)] ?? 0) + 1
  const unlinked = all.filter((one) => !one.deck && !one.uses.length && one.how === 'attachment').length
  console.log(`  the book holds ${all.length} files: ${JSON.stringify(by)}, unlinked ${unlinked}, deck pictures ${all.filter((one) => one.deck).length}`)

  // ── In from the sidebar, as a person goes ──
  await go('home')
  const side = h.locator('aside').locator('button, [role="button"], a, [data-row]', { hasText: /^Files$/ }).first()
  if (await side.count()) await side.click()
  else await go('media')
  check('the sidebar\'s "Files" opens Files', await waitFor(() => h.evaluate(() => !!document.querySelector('[data-media-page]'))))
  await wait(1200)
  // Files opens where it was left (a tab a step keeps): All, for the whole book.
  if (await h.locator('[data-media-kinds] button', { hasText: /^All/ }).count()) await chip('All')
  await shot('files-all')
  const total = all.filter((one) => !one.deck).length
  console.log(`  All: "${await countSaid()}", chips ${JSON.stringify(await chips())}`)
  check(`All's count says every file the book holds (${total})`, (await countSaid()).replace(/,/g, '').startsWith(String(total)), await countSaid())
  const pileCounts = await h.$$eval('[data-pile]', (all) => all.map((one) => [one.dataset.pile, Number(one.dataset.count), one.textContent.replace(/\s+/g, ' ').trim()]))
  for (const [shelf, n, said] of pileCounts) check(`the ${shelf} pile counts what the book holds (${by[shelf]})`, n === by[shelf], said)
  const hands = await noHand('[data-media-grid]')
  check('All: the hand over everything a click does something to', hands.length === 0, hands.join(' | '))

  for (const [label, shelf] of [['Books', 'pdf'], ['Images', 'picture'], ['Audio', 'audio'], ['Videos', 'video'], ['Documents', 'document']]) {
    if (!by[shelf]) continue
    await chip(label)
    await wait(900)
    await shot(`files-${shelf}`)
    const said = await countSaid()
    check(`${label}: its count says what it holds (${by[shelf]})`, said.replace(/,/g, '').startsWith(String(by[shelf])), said)
    const miss = await noHand(shelf === 'pdf' ? '[data-media-kinds]' : '[data-media-grid]')
    check(`${label}: the hand over everything a click does something to`, miss.length === 0, miss.join(' | '))
    if (shelf === 'pdf') {
      // The book in the middle of "Continue reading": its page, then the day it is to be done by, as two parts.
      const under = await h.evaluate(() => [...document.querySelectorAll('[data-flex-carousel-caption] span')].map((one) => one.innerText.trim()).filter(Boolean))
      console.log(`  under "Continue reading": ${JSON.stringify(under)}`)
      const line = under.find((one) => /\bp\. /.test(one)) ?? ''
      check('Books: under "Continue reading", the page and the day to finish by never run together', !!line && !/\d Done by/.test(line) && (!/Done by/.test(line) || / · Done by/.test(line)), line)
    }
  }

  // ── Images: a right-click, ⌘A and the menu on what is picked, Esc ──
  if (by.picture) {
    await chip('Images')
    await wait(800)
    const first = h.locator('[data-media-grid] [data-media][data-src]').first()
    await first.click({ button: 'right' })
    await wait(400)
    const one = await menuRows()
    check('Images: a picture\'s right-click menu, its own actions first', one.length > 3 && /^(Open note|Look at it)/.test(one[0] ?? ''), one.join(' | '))
    await h.keyboard.press('Escape'); await wait(300)
    await h.mouse.move(5, 400)
    await h.keyboard.press('Meta+a'); await wait(400)
    check(`Images: ⌘A picks all ${by.picture}, said on the line`, new RegExp(`^${by.picture} selected`).test((await countSaid()).replace(/,/g, '')), await countSaid())
    await first.click({ button: 'right' })
    await wait(400)
    const many = await menuRows()
    check('Images: right-click on what is picked counts them ("Put 104 in a note…")', many.some((row) => new RegExp(`Put ${by.picture} in a note`).test(row.replace(/,/g, ''))), many.join(' | '))
    await shot('files-picked-menu')
    await h.keyboard.press('Escape'); await wait(300)
    await h.keyboard.press('Escape'); await wait(400)
    check('Images: Esc lets the picked ones go', !/selected/.test(await countSaid()), await countSaid())
    // Search with nothing found: said in plain words, the count gone.
    await h.locator('input[placeholder="Find by note, name or words"]').fill('zzqqxx nothing like it')
    await wait(800)
    const nothing = await h.evaluate(() => document.querySelector('[data-media-nothing]')?.textContent.trim() ?? '')
    check('Images: a search that finds nothing says so', /Nothing here has “zzqqxx nothing like it”/.test(nothing), nothing)
    await h.locator('input[placeholder="Find by note, name or words"]').fill('')
  }

  // ── Beside its siblings: Files and Review against Writing, Tasks and a day's page ──
  const measure = () => h.evaluate(() => {
    const header = [...document.querySelectorAll('main header, section > header')].find((one) => one.getBoundingClientRect().width > 300 && one.offsetParent)
    const box = header?.getBoundingClientRect()
    const words = header ? [...header.querySelectorAll('*')].filter((one) => one.children.length === 0 && one.textContent.trim() && one.getBoundingClientRect().width > 0) : []
    const sizes = [...new Set(words.map((one) => getComputedStyle(one).fontSize))]
    // The first thing on the line, words or the box that holds them (a tab track), from the header's own left.
    const first = header ? [...header.querySelectorAll('*')].map((one) => one.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0).map((r) => r.left).sort((a, b) => a - b)[0] : 0
    return box ? { height: Math.round(box.height), left: Math.round(box.left), firstWords: Math.round((first ?? 0) - box.left), sizes } : null
  })
  const siblings = {}
  for (const [name, view] of [['Files', 'media'], ['Review', 'review'], ['Writing', 'articles'], ['Tasks', 'today'], ['a day', 'day']]) {
    await go(view)
    await wait(1200)
    siblings[name] = await measure()
    if (SHOTS) await shot(`sibling-${view}`)
  }
  console.log(`  headers: ${JSON.stringify(siblings)}`)
  const heights = Object.entries(siblings).filter(([, one]) => one).map(([name, one]) => `${name} ${one.height}`)
  check(`Files and Review's header line is as tall as their siblings' (${heights.join(', ')})`, ['Files', 'Review'].every((name) => siblings[name] && Object.values(siblings).filter(Boolean).every((one) => Math.abs(one.height - siblings[name].height) <= 1)), heights.join(', '))
  check(`Files and Review start their header's words where their siblings do (${Object.entries(siblings).filter(([, one]) => one).map(([name, one]) => `${name} ${one.firstWords}`).join(', ')})`, ['Files', 'Review'].every((name) => siblings[name] && Math.abs(siblings[name].firstWords - siblings.Writing?.firstWords) <= 2), JSON.stringify(siblings))
  check('no page errors', c.errors.length === 0, c.errors.slice(0, 3).join(' | '))
} catch (error) {
  check(`ran to the end (${error.message.split('\n')[0]})`, false)
} finally {
  await c.close()
  done()
}
