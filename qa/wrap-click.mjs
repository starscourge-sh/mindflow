// Collage inside Wrapped is look-only: a click on a tipped photo / picture row
// must not open a note, leave the story, or advance the card. Only chrome
// (progress, close) and empty story ground turn or dismiss.
//   QA_DATA=… QA_ENTRY=out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/wrap-click.mjs
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1280, height: 800 })
const { h, close } = c

const WORST = {
  captures: 48,
  tags: [{ name: 'reading', n: 12 }, { name: 'quotes', n: 7 }],
  notes: ['Giorgio Vasari', 'Meditations', 'Commonplace leaves'],
  notesLabel: 'Gems kept',
  reads: { total: 6, finished: 4, left: [{ title: 'Half a chapter', minutes: 8, needs: 20 }] },
  minutes: 240,
  sessions: 8,
  focusTasks: [{ name: 'Essay draft', minutes: 90 }],
  planned: 90,
  did: 40,
  planRows: [{ name: 'Essay draft', planned: 90, did: 40 }],
  sites: [{ site: 'x.com', count: 4 }],
  gems: 8,
  run: 5,
  busiest: { label: 'Tuesday', day: '2026-11-17', n: 9 },
  well: ['Kept a page of quotes from the walk.', 'Physics deck begun; Dorian Gray finished.', 'Small steps on the big things.'],
  thin: false,
  pictures: [
    { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', title: 'Leaf', type: 'gem', id: 'wrap-click-pic-1' },
    { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', title: 'Desk', type: 'gem', id: 'wrap-click-pic-2' },
    { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', title: 'Ink', type: 'gem', id: 'wrap-click-pic-3' }
  ],
  heroes: [
    { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', stored: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', title: 'Hero', type: 'gem', id: 'wrap-click-hero' }
  ]
}

try {
  const week = await h.evaluate(() => {
    const d = new Date(Date.now() - 2 * 864e5)
    return `week:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await h.evaluate(([id, worst]) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: { id, world: 'files', worst } })), [week, WORST])
  await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
  await wait(600)

  const goTo = async (want) => {
    for (let i = 0; i < 16; i++) {
      const kind = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
      if (kind === want) return kind
      if (kind === 'report' || kind === 'quiet') return kind
      await h.keyboard.press('ArrowRight')
      await wait(280)
    }
    return await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
  }

  // Intro: tipped hero is collage — click must keep the story open on intro.
  const intro = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
  check('opens on intro', intro === 'intro', intro)
  const hero = h.locator('[data-wrap-card] [data-wrap-hero], [data-wrap-card] [data-wrap-tipped], [data-wrap-card] [data-wrap-cover]').first()
  if (await hero.count()) {
    const before = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
    await hero.click({ force: true })
    await wait(400)
    const after = await h.locator('[data-wrap-story]').count()
    const kind = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card').catch(() => null)
    check('clicking cover collage keeps Wrapped open', after === 1, `stories=${after}`)
    check('clicking cover collage does not leave intro by opening a note', kind === before, `${before} → ${kind}`)
  } else {
    check('intro has a cover collage to click', false, 'no cover/hero')
  }

  // Pictures card: row click must not dismiss or open a note.
  const pictures = await goTo('pictures')
  if (pictures === 'pictures') {
    const before = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
    const pic = h.locator('[data-wrap-prints] [data-wrap-tipped], [data-wrap-prints] img, [data-wrap-flow] img').first()
    if (await pic.count()) {
      await pic.click({ force: true })
      await wait(500)
      const open = await h.locator('[data-wrap-story]').count()
      const kind = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card').catch(() => null)
      check('clicking a picture keeps Wrapped open', open === 1, `stories=${open}`)
      check('clicking a picture does not open a note / leave the card', kind === before, `${before} → ${kind}`)
    } else {
      check('pictures card has a clickable collage image', false, 'no picture target')
    }
  } else {
    check('forced facts reach a pictures card', false, pictures)
  }

  // Notes / journal page: click on the page field must not advance or dismiss.
  const notes = await goTo('notes')
  if (notes === 'notes') {
    const before = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
    const page = h.locator('[data-wrap-folder], [data-wrap-journal]').first()
    if (await page.count()) {
      const box = await page.boundingBox()
      if (box) await h.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45)
      await wait(400)
      const open = await h.locator('[data-wrap-story]').count()
      const kind = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card').catch(() => null)
      check('clicking the journal page keeps Wrapped open', open === 1, `stories=${open}`)
      check('clicking the journal page does not advance the story', kind === before, `${before} → ${kind}`)
    } else {
      check('notes card has a journal page', false, 'no folder/journal')
    }
  }

  // Top breathing room: progress / close sit clear of the card edge (not flush).
  const pad = await h.evaluate(() => {
    const card = document.querySelector('[data-wrap-card]')
    const bar = document.querySelector('[data-wrap-chrome] button')
    if (!card || !bar) return 0
    return Math.round(bar.getBoundingClientRect().top - card.getBoundingClientRect().top)
  })
  check('wrap chrome has real top breathing room (≥ 24px)', pad >= 24, `${pad}px`)

  // Chrome still closes.
  await h.locator('[data-wrap-story] [aria-label="Close"]').click()
  await h.waitForSelector('[data-wrap-story]', { state: 'detached', timeout: 5000 })
  check('close chrome still ends Wrapped', true)
} finally {
  await close()
}
done()
