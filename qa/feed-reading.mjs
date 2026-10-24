// The Feed's Reading tab: your Pages as a reading list. The Notes and Reading
// tabs switch and are remembered; Reading lists eight or more Pages with their
// titles, first lines, read times and pictures; Unread and History follow an
// open; "Today's read" holds after a reload; a row opens the long-form reader
// with its title and read time; Reply at its foot adds a thought; a chosen
// line restacked is a new gem linked to the Page, kept for tomorrow; no
// private Page shows.
import { mkdirSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const SHOTS = process.env.SHOTS ?? '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/briefs/shots/feed4'
mkdirSync(SHOTS, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1600, height: 1000 })
const { h, v, go, errors, close } = s
const paint = (name) => h.evaluate((n) => { localStorage.setItem('theme', n); window.dispatchEvent(new StorageEvent('storage', { key: 'theme' })); document.documentElement.classList.toggle('dark', n === 'dark') }, name)
try {
  const reading = await v('feed:reading')
  check('Reading has 8 or more Pages', reading.pages.length >= 8, String(reading.pages.length))
  check("there is a Today's read of 150 words or more", !!reading.today && reading.pages.find((one) => one.id === reading.today)?.words >= 150, reading.today)
  // A private Page never shows.
  const secret = await v('items', 'article').catch(() => [])
  const hidden = (Array.isArray(secret) ? secret : []).filter((one) => one.private).map((one) => one.id)
  check('no private Page is listed', !reading.pages.some((one) => hidden.includes(one.id)), `${hidden.length} private`)

  await go('feed')
  await h.waitForTimeout(800)
  check('the Notes tab is on first', (await h.locator('[data-tabs="feed"] [aria-selected="true"]').getAttribute('data-tab')) === 'notes')
  const notesTabAt = await h.locator('[data-tabs="feed"]').boundingBox()
  await h.click('[data-tabs="feed"] [data-tab="reading"]')
  await h.waitForTimeout(900)
  const readingTabAt = await h.locator('[data-tabs="feed"]').boundingBox()
  check('the tabs stay in place when switched', notesTabAt && readingTabAt && Math.abs(notesTabAt.x - readingTabAt.x) < 1 && Math.abs(notesTabAt.y - readingTabAt.y) < 1, JSON.stringify([notesTabAt, readingTabAt]))
  const rows = await h.locator('[data-reading-row]').count()
  check('Reading shows 8 or more rows', rows >= 8, String(rows))
  const shown = await h.locator('[data-reading-row]').evaluateAll((all) => all.map((one) => ({
    title: one.querySelector('[data-reading-title]')?.textContent ?? '',
    dek: one.querySelector('[data-reading-dek]')?.textContent ?? '',
    minutes: one.querySelector('[data-reading-minutes]')?.textContent ?? '',
    picture: !!one.querySelector('[data-reading-picture] img')
  })))
  check('every row has a title and a read time', shown.every((one) => one.title && /^\d+ min read$/.test(one.minutes)), JSON.stringify(shown.slice(0, 2)))
  check('most rows have a dek', shown.filter((one) => one.dek).length >= Math.ceil(shown.length * 0.75), `${shown.filter((one) => one.dek).length}/${shown.length}`)
  check('a few rows have a picture', shown.filter((one) => one.picture).length >= 2, String(shown.filter((one) => one.picture).length))
  const todayTitle = await h.locator('[data-reading-today] [data-reading-title]').textContent()
  check("Today's read shows over the list", !!todayTitle)
  for (const name of ['light', 'dark']) {
    await paint(name)
    await h.waitForTimeout(500)
    await h.screenshot({ path: `${SHOTS}/reading-${name}.png` })
  }
  await paint('light')

  // Remembered after a reload, and the same Today's read.
  await h.reload()
  await h.waitForTimeout(2000)
  await go('feed')
  await h.waitForTimeout(900)
  check('Reading is still the tab after a reload', (await h.locator('[data-tabs="feed"] [aria-selected="true"]').getAttribute('data-tab')) === 'reading')
  check("Today's read is the same after a reload", (await h.locator('[data-reading-today] [data-reading-title]').textContent()) === todayTitle)

  // Unread and History follow an open.
  await h.click('[data-tabs="reading"] [data-tab="unread"]')
  await h.waitForTimeout(500)
  const unreadBefore = await h.locator('[data-reading-row]').count()
  const first = await h.locator('[data-reading-row]').first()
  const firstId = await first.getAttribute('data-reading-row')
  const page = reading.pages.find((one) => one.id === firstId)
  await first.click()
  await h.waitForTimeout(1200)
  check('the reader opens with the title', (await h.locator('[aria-label="Reading"] h1').textContent())?.trim() === page.title.trim(), page.title)
  check('the reader shows the read time', /\d+ min read/.test((await h.locator('[data-read-minutes]').textContent()) ?? ''))
  const face = await h.evaluate(() => getComputedStyle(document.querySelector('[aria-label="Reading"] .tiptap.ProseMirror p')).fontFamily)
  check('the reader sets the words in serif', face === (await h.evaluate(() => getComputedStyle(document.querySelector('[data-read-minutes]').closest('article').querySelector('h1')).fontFamily)) || (/serif/i.test(face) && !/sans-serif/i.test(face.split(',')[0])), face)
  check('the foot bar has Reply, Restack and Open to edit', (await h.locator('[data-reading-reply]').count()) === 1 && (await h.locator('[data-reading-restack]').count()) === 1 && (await h.locator('[data-reading-edit]').count()) === 1)
  for (const name of ['light', 'dark']) {
    await paint(name)
    await h.waitForTimeout(500)
    await h.screenshot({ path: `${SHOTS}/reader-${name}.png` })
  }
  await paint('light')

  // Reply from the foot bar adds a thought.
  const before = (await v('glosses', firstId)).length
  await h.locator('[data-reading-reply]').scrollIntoViewIfNeeded()
  await h.click('[data-reading-reply]')
  await h.waitForTimeout(500)
  await h.keyboard.type('A reply from the reader')
  await h.keyboard.press('Enter')
  await h.waitForTimeout(900)
  const after = await v('glosses', firstId)
  check('Reply from the foot bar adds a gloss', after.length === before + 1 && after.some((one) => one.body === 'A reply from the reader'), `${before} -> ${after.length}`)

  // Choose a line in the words: "Restack this line" makes a restack linked to the Page.
  await h.keyboard.press('Escape').catch(() => {})
  const chose = await h.evaluate(() => {
    const p = [...document.querySelectorAll('[aria-label="Reading"] .tiptap.ProseMirror p')].find((one) => (one.textContent ?? '').trim().split(/\s+/).length > 6)
    if (!p) return null
    p.scrollIntoView({ block: 'center' })
    const text = p.firstChild
    const range = document.createRange()
    const node = [...p.childNodes].find((one) => one.nodeType === 3) ?? text
    range.setStart(node, 0)
    range.setEnd(node, Math.min(node.textContent.length, 40))
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    return sel.toString()
  })
  await h.waitForTimeout(500)
  check('choosing words shows "Restack this line"', chose && (await h.locator('[data-read-restack-line]').isVisible()), chose)
  // Keeping it as a gem still shows from the same choice.
  const keepGem = await h.evaluate(() => [...document.querySelectorAll('button')].some((one) => /gem/i.test(one.textContent ?? one.getAttribute('aria-label') ?? '') && one.getBoundingClientRect().height > 0))
  check('a chosen line can still be kept as a gem', keepGem)
  await h.click('[data-read-restack-line]')
  await h.waitForTimeout(500)
  const filled = await h.locator('[data-feed-composer] textarea').inputValue()
  check('the restack starts with the chosen line', filled.replace(/\s+/g, ' ').trim() === chose.replace(/\s+/g, ' ').trim(), filled)
  await h.click('[data-feed-restack-save]')
  await h.waitForTimeout(900)
  const made = await h.evaluate(async ([id, line]) => {
    const all = await window.api.haligtree('items', 'nugget')
    const named = all.filter((one) => (one.title ?? '').trim() === line.trim())
    const full = await Promise.all(named.map(async (one) => ({ id: one.id, body: await window.api.haligtree('notes:body', 'nuggets', one.id).catch(() => null) })))
    return full.filter((one) => JSON.stringify(one.body ?? '').includes(`nugget:${id}`))
  }, [firstId, chose.replace(/\s+/g, ' ').trim()])
  check('the restack is a new gem linking to the Page', made.length === 1, String(made.length) + ' ' + (await h.evaluate(() => document.body.innerText.match(/Restacked[^\n]*|could not[^\n]*/)?.[0] ?? 'no toast')))
  check('the restack is kept for tomorrow', !(await v('feed')).posts.some((one) => one.id === made[0]?.id))

  // Back on the list: out of Unread, on top of History.
  await h.keyboard.press('Escape')
  await h.waitForTimeout(400)
  await h.evaluate(() => document.querySelector('[aria-label="Reading"]') && [...document.querySelectorAll('button')].find((one) => /Done reading/.test(one.textContent ?? ''))?.click())
  await h.waitForTimeout(800)
  const unreadAfter = await h.locator('[data-reading-row]').count()
  check('the opened Page leaves Unread', unreadAfter === unreadBefore - 1 && !(await h.locator(`[data-reading-row="${firstId}"]`).count()), `${unreadBefore} -> ${unreadAfter}`)
  await h.click('[data-tabs="reading"] [data-tab="history"]')
  await h.waitForTimeout(500)
  check('the opened Page is first in History', (await h.locator('[data-reading-row]').first().getAttribute('data-reading-row')) === firstId)
  await h.click('[data-tabs="reading"] [data-tab="all"]')
  await h.click('[data-tabs="feed"] [data-tab="notes"]')
  await h.waitForTimeout(500)
  check('back on Notes, the posts show', (await h.locator('[data-feed-post]').count()) > 0)
  check('no page errors', !errors.length, errors.join(' | '))
} finally {
  await close()
}
done()
