// Wrapped type contrast: every lead, headline and caption on cream journal and
// on ink cards clears 4.5:1. Catches pale night ink washed onto JournalField
// (user shot 08-faint-headline).
//   qa/run-one.sh out-gate wrap-contrast
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox({ width: 1280, height: 800 })
const { h, close } = c

const WORST = {
  captures: 48,
  tags: [{ name: 'reading', n: 12 }, { name: 'quotes', n: 7 }],
  notes: ['Meditations', 'Commonplace leaves', 'Giorgio Vasari', 'Oscar Wilde'],
  notesLabel: 'Top sources',
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
  well: ['Kept a page of quotes from the walk.', 'Physics deck begun; Dorian Gray finished.'],
  thin: false,
  pictures: [
    { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', title: 'Leaf', type: 'gem', id: 'wc-1' },
    { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', title: 'Desk', type: 'gem', id: 'wc-2' }
  ],
  heroes: [
    { src: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', stored: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', title: 'Hero', type: 'gem', id: 'wc-h' }
  ]
}

const readContrast = () => h.evaluate(() => {
  const lum = (rgb) => {
    const [r, g, b] = (rgb.match(/[\d.]+/g) ?? [0, 0, 0]).slice(0, 3).map(Number).map((v) => {
      const x = v / 255
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (fg, bg) => {
    const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
    return (hi + 0.05) / (lo + 0.05)
  }
  const sampleBg = (el) => {
    let node = el
    while (node && node !== document.body) {
      const bg = getComputedStyle(node).backgroundColor
      if (bg && !/rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg) && bg !== 'transparent') return bg
      node = node.parentElement
    }
    return getComputedStyle(document.querySelector('[data-wrap-card]') ?? document.body).backgroundColor
  }
  const pick = [...document.querySelectorAll('[data-wrap-lead], [data-wrap-card] h2, [data-wrap-card] .font-heading, [data-wrap-ink]')]
    .filter((el) => el.getBoundingClientRect().width > 8 && getComputedStyle(el).opacity !== '0')
  return pick.slice(0, 24).map((el) => {
    const fg = getComputedStyle(el).color
    const bg = sampleBg(el)
    return { text: (el.textContent ?? '').trim().slice(0, 48), fg, bg, ratio: Math.round(ratio(fg, bg) * 10) / 10 }
  })
})

try {
  for (const world of ['files', 'night']) {
    const week = await h.evaluate(() => {
      const d = new Date(Date.now() - 2 * 864e5)
      return `week:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })
    await h.evaluate(([id, worst, world]) => window.dispatchEvent(new CustomEvent('haligtree:wrap', { detail: { id, world, worst } })), [week, WORST, world])
    await h.waitForSelector('[data-wrap-card]:not([data-wrap-card="loading"])', { timeout: 15000 })
    await wait(500)
    const seen = []
    for (let i = 0; i < 14; i++) {
      const kind = await h.locator('[data-wrap-card]').getAttribute('data-wrap-card')
      seen.push(kind)
      await wait(kind === 'notes' || kind === 'well' || kind === 'pictures' || kind === 'intro' ? 600 : 200)
      const rows = await readContrast()
      const fails = rows.filter((row) => row.ratio < 4.5)
      check(`${world}/${kind}: type ≥ 4.5:1`, fails.length === 0, fails.map((f) => `${f.ratio} “${f.text}”`).join(' | ') || rows.slice(0, 3).map((r) => r.ratio).join(','))
      if (kind === 'notes' || kind === 'well' || kind === 'pictures') {
        const journal = await h.locator('[data-wrap-journal]').count()
        check(`${world}/${kind}: lives on JournalField`, journal >= 1, String(journal))
      }
      if (kind === 'report' || kind === 'quiet') break
      await h.keyboard.press('ArrowRight')
      await wait(280)
    }
    await h.keyboard.press('Escape')
    await h.waitForSelector('[data-wrap-story]', { state: 'detached', timeout: 5000 }).catch(() => null)
    await wait(200)
  }
} finally {
  await close()
}
done()
