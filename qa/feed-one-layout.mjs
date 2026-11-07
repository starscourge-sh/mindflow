// Feed and Review as one app: the Feed's three tabs (Notes, Reading, Liked) share one column and one side
// column, in the same place; every control holds still as the tabs switch; the tabs sit on the page's top
// line, as Review's, Stats' and Goals' do; "Connected to: A, B" reads inline on every tab. Frames of the
// six views (Feed's three, Review's three) at 1920 and 1200 wide, light and dark, go to QA_SHOTS.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.QA_SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/feed-frames/after'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1920, height: 1080 })
const { h, go, electron, both, size, close, errors } = s
const sql = (q, ...args) => electron.evaluate((_, [q, args]) => globalThis.qaFeedSql(q, ...args), [q, args])
const ago = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const tab = async (name) => { await h.locator(`[data-chips="feed"] [data-chip="${name}"]`).click(); await h.waitForTimeout(1100) }
const box = (sel) => h.evaluate((sel) => { const one = [...document.querySelectorAll(sel)].find((n) => n.offsetWidth); if (!one) return null; const r = one.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), w: Math.round(r.width) } }, sel)
// Every control on the page's top line and in the tab track: its box, by its words.
const controls = () => h.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-chips="feed"] [data-chip], [data-feed-pages]')].filter((one) => one.offsetWidth).map((one) => { const r = one.getBoundingClientRect(); return [one.textContent.trim(), [r.left, r.top, r.width, r.height].map(Math.round).join(',')] })))
try {
  // Likes, as the user has them, and one quote whose words link two notes ("Connected to: A, B").
  const gems = await sql("select id from nuggets where tier = 'nugget' and private = 0 and binned_at is null and superseded_by is null order by created_at limit 20")
  for (const [at, gem] of gems.entries()) await sql("insert or replace into feed_reacts (day, key, reaction, was) values (?, ?, 'like', '{}')", ago(at * 9), `nugget:${gem.id}`)
  const pages = await sql("select id, title from nuggets where tier = 'article' and binned_at is null limit 2")
  const linked = gems[0].id
  if (pages.length === 2) {
    // As the editor keeps it: the line's words, a link, a comma and a link, each its own piece of one paragraph.
    const link = (one, label) => ({ type: 'noteLink', attrs: { id: `article:${one.id}`, label } })
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Small, steady work outlasts every burst of effort.' }] }, { type: 'paragraph', content: [{ type: 'text', text: 'Connected to: ' }, link(pages[0], 'Discipline and operating principles'), { type: 'text', text: ', ' }, link(pages[1], 'Ambition and failure')] }] }
    await sql("update nuggets set body = ? where id = ?", JSON.stringify(body), linked)
  }
  await go('feed')
  await tab('notes')

  // The three tabs: column, side column and controls, measured on each.
  const seen = {}
  for (const name of ['notes', 'reading', 'liked', 'notes']) {
    await tab(name)
    seen[name] = seen[name] ?? []
    seen[name].push({
      column: await box('[data-feed] ol, [data-feed-liked] ol'),
      side: await box('[data-feed-side], [data-liked-side]'),
      controls: await controls(),
      inHeader: await h.evaluate(() => !!document.querySelector('[data-chips="feed"]')?.closest('header'))
    })
  }
  const [notes, reading, liked] = [seen.notes[0], seen.reading[0], seen.liked[0]]
  console.log(JSON.stringify({ notes, reading, liked }, null, 1))
  check('the column starts on one left edge on all three tabs', notes.column.l === reading.column.l && reading.column.l === liked.column.l, `${notes.column.l} ${reading.column.l} ${liked.column.l}`)
  check('the column is one width on all three tabs', notes.column.w === reading.column.w && reading.column.w === liked.column.w, `${notes.column.w} ${reading.column.w} ${liked.column.w}`)
  check('the side column sits in one place on all three tabs', notes.side && reading.side && liked.side && notes.side.l === reading.side.l && reading.side.l === liked.side.l && notes.side.w === reading.side.w, `${notes.side?.l} ${reading.side?.l} ${liked.side?.l}`)
  const tabsOf = (one) => Object.fromEntries(Object.entries(one.controls).filter(([k]) => ['Notes', 'Reading', 'Liked'].includes(k)))
  check('the tabs hold still through every switch', JSON.stringify(tabsOf(notes)) === JSON.stringify(tabsOf(reading)) && JSON.stringify(tabsOf(reading)) === JSON.stringify(tabsOf(liked)) && JSON.stringify(tabsOf(seen.notes[1])) === JSON.stringify(tabsOf(notes)), JSON.stringify([tabsOf(notes), tabsOf(reading), tabsOf(liked)]))
  check('the tabs sit on the page\'s top line, as Review\'s do', notes.inHeader && reading.inHeader && liked.inHeader)

  // "Connected to: A, B" inline, on Liked and on Notes alike: the two links and the comma on one line.
  const inline = () => h.evaluate((id) => {
    const post = [...document.querySelectorAll(`[data-feed-id="${id}"]`)].find((n) => n.offsetWidth)
    const links = post ? [...post.querySelectorAll('[data-feed-link]')] : []
    return { n: links.length, tops: links.map((one) => Math.round(one.getBoundingClientRect().top)), display: links.map((one) => getComputedStyle(one).display) }
  }, linked)
  if (pages.length === 2) {
    await tab('liked')
    await h.locator(`[data-feed-id="${linked}"]`).first().scrollIntoViewIfNeeded().catch(() => {})
    const onLiked = await inline()
    check('Liked: "Connected to: A, B" reads on one line', onLiked.n === 2 && onLiked.tops[0] === onLiked.tops[1], JSON.stringify(onLiked))
    const lone = await h.evaluate((id) => [...document.querySelectorAll(`[data-feed-id="${id}"]`)].find((n) => n.offsetWidth)?.innerText.split('\n').some((line) => line.trim() === ','), linked)
    check('...with no "," on a line of its own', lone === false)
    await h.locator(`[data-feed-id="${linked}"]`).first().screenshot({ path: `${SHOTS}/connected-liked.png` }).catch(() => {})
  } else check('two Pages to link to in the sandbox', false)

  // Section names in one face on both pages, whatever heading font is chosen in Settings: "Today's read" and
  // "This week" in the Feed as a deck's name in Review (panel headings stay in the text face; only titles take the heading font).
  await h.evaluate(() => document.documentElement.style.setProperty('--mf-heading-font', 'Helvetica, Arial, sans-serif'))
  const faceOf = (sel) => h.evaluate((sel) => { const one = [...document.querySelectorAll(sel)].find((n) => n.offsetWidth); return one ? getComputedStyle(one).fontFamily : null }, sel)
  await tab('liked')
  const likedFace = await faceOf('[data-liked-group]'); const likedText = await faceOf('[data-feed-account]'); const likedFeedHeadingClass = await h.evaluate(() => document.querySelector('[data-liked-group]')?.className)
  await tab('reading')
  const readingFace = await faceOf('[data-reading-today] h2, [data-feed-reading] h2')
  await go('review')
  await h.evaluate(() => document.querySelector('[data-review-tab="decks"]')?.click())
  await h.waitForTimeout(1200)
  const deckFace = await faceOf('[data-deck-shelf] h3')
  const textFace = deckFace && await faceOf('[data-review-hint]')
  const reviewHint = await faceOf('[data-review-hint]')
  console.log(JSON.stringify({ likedText, likedFeedHeadingClass, likedFace, readingFace, deckFace, textFace, reviewHint }))
  check('Feed\'s section names ("This week", "Today\'s read") are in the text face, as Review\'s panel words are, with a sans heading font chosen', likedFace === textFace && (readingFace === null || readingFace === textFace) && likedFace !== 'Helvetica, Arial, sans-serif', `${likedFace} | ${readingFace} | ${reviewHint}`)
  await h.evaluate(() => document.documentElement.style.removeProperty('--mf-heading-font'))

  // Frames: Feed's three tabs and Review's three, at 1920 and 1200 wide, light and dark.
  for (const [w, hh] of [[1920, 1080], [1200, 800]]) {
    await size(w, hh)
    await go('feed')
    for (const name of ['notes', 'reading', 'liked']) { await tab(name); await both(`${SHOTS}/${w}-feed-${name}`) }
    await go('review')
    await h.waitForTimeout(1200)
    for (const name of ['decks', 'cards', 'stats']) {
      await h.evaluate((name) => document.querySelector(`[data-review-tab="${name}"]`)?.click(), name)
      await h.waitForTimeout(1200)
      await both(`${SHOTS}/${w}-review-${name}`)
    }
  }
  check('no errors', errors.length === 0, errors.slice(0, 3).join(' | '))
} finally {
  await close()
}
done()
