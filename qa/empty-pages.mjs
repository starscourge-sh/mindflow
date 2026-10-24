// Every list page, empty, wears one empty-page pattern: the same scenery band
// (height, corners, fade, the page's column width), then the same Example
// line (solid, the list's width, the same type), then the faded sample rows.
// Pages with their own layout (Month, Week, Year) keep their top, but their
// picture is the same rounded, unframed band. Lookups shows its example even
// after a word has been asked and dealt with.
//
//   npx electron-vite build --outDir out-empty
//   QA_DATA=$(mktemp -d) QA_ENTRY=out-empty/main/index.js HALIGTREE_QA_AWAY=1 SHOTS=<dir> node qa/empty-pages.mjs
import { mkdirSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const dir = process.env.SHOTS ?? '/tmp/empty-pages'
mkdirSync(dir, { recursive: true })
const { check, done } = checks()
const s = await sandbox({ width: 1200, height: 800, seeded: false })
const { h, v, go, close } = s
const LISTS = ['inbox', 'lookups', 'archived', 'discarded', 'nuggets', 'articles', 'questions', 'goals', 'queue', 'review', 'tags', 'today', 'upcoming', 'later', 'stats', 'map', 'matrix']
const OWN = ['monthpage', 'weekpage']

const measure = () => h.evaluate(() => {
  const px = (el, key) => (el ? parseFloat(getComputedStyle(el)[key]) : null)
  const frame = document.querySelector('[data-example-frame]')
  const line = frame?.querySelector('[data-example-line]')
  const rows = frame?.querySelector('[data-example]')
  const band = frame?.closest('.isolate')?.querySelector('[data-scene="rest"]') ?? null
  const lr = line?.getBoundingClientRect()
  const br = band?.getBoundingClientRect()
  return {
    example: !!frame, band: !!band,
    bandH: br ? Math.round(br.height) : null, bandW: br ? Math.round(br.width) : null, bandR: px(band, 'borderTopLeftRadius'), bandMask: band ? getComputedStyle(band).maskImage : null,
    lineW: lr ? Math.round(lr.width) : null, lineH: lr ? Math.round(lr.height) : null, lineFont: px(line?.querySelector('.mf-prose'), 'fontSize'), lineBorder: line ? getComputedStyle(line).borderTopStyle : null, linePad: line ? getComputedStyle(line).padding : null,
    lineBg: line ? getComputedStyle(line).backgroundColor : null, lineLeft: lr && br ? Math.round(lr.left - br.left) : null, lineRight: lr && br ? Math.round(br.right - lr.right) : null,
    rowsMask: rows ? getComputedStyle(rows).maskImage : null, rowsOpacity: rows ? getComputedStyle(rows).opacity : null
  }
})

try {
  await v('onboarding:set', { welcomed: new Date().toISOString(), newsSeen: true, pageHints: false, hidden: true })
  await v('settings:set', { scenery: true, sceneryRest: true, sceneryToday: true, sceneryFolders: [join(process.cwd(), 'src/renderer/src/assets/scenery')], motion: false, sounds: false })
  await h.reload()
  await h.waitForTimeout(2500)
  const seen = {}
  for (const id of LISTS) {
    await go(id)
    await h.waitForTimeout(1200)
    seen[id] = await measure()
    await h.screenshot({ path: `${dir}/${id}.png` })
    const m = seen[id]
    // The Map keeps its plain ground: its example sits at the top, no picture behind it.
    if (id === 'map') check('map: example, with no scenery behind it', m.example && !m.band, JSON.stringify(m))
    else check(`${id}: example, over the scenery band`, m.example && m.band, JSON.stringify(m))
  }
  const base = seen.nuggets
  for (const id of LISTS) {
    const m = seen[id]
    if (!m.example || !m.band) continue
    check(`${id}: band ${m.bandW}x${m.bandH}, radius ${m.bandR}, faded as on Gems`, m.bandH === base.bandH && m.bandR === base.bandR && m.bandMask === base.bandMask, `${m.bandH}/${base.bandH} ${m.bandR}/${base.bandR}`)
    check(`${id}: Example line ${m.lineW}x${m.lineH}, ${m.lineFont}px, ${m.lineBorder}, set in the band as on Gems`, m.linePad === base.linePad && m.lineFont === base.lineFont && m.lineBorder === 'solid' && m.lineBg === base.lineBg && m.lineLeft === base.lineLeft && m.lineRight === base.lineRight, `left ${m.lineLeft}/${base.lineLeft} right ${m.lineRight}/${base.lineRight} pad ${m.linePad}/${base.linePad}`)
    check(`${id}: sample rows faded the same`, m.rowsMask === base.rowsMask && m.rowsOpacity === base.rowsOpacity)
  }
  for (const id of OWN) {
    await go(id)
    await h.waitForTimeout(1200)
    const m = await h.evaluate(() => {
      const band = document.querySelector('[data-scene="today"]')
      const line = document.querySelector('[data-example-line]')
      return {
        band: !!band, r: band ? parseFloat(getComputedStyle(band).borderTopLeftRadius) : null, mask: band ? getComputedStyle(band).maskImage : null, framed: band ? getComputedStyle(band.parentElement).paddingTop : null,
        lineFont: line ? parseFloat(getComputedStyle(line.querySelector('.mf-prose')).fontSize) : null, lineBorder: line ? getComputedStyle(line).borderTopStyle : null
      }
    })
    await h.screenshot({ path: `${dir}/${id}.png` })
    check(`${id}: its picture is the same band (radius ${m.r}, fade, no frame)`, m.band && m.r === base.bandR && m.mask === base.bandMask && m.framed === '0px', JSON.stringify(m))
    if (m.lineFont) check(`${id}: its Example line looks like every other`, m.lineFont === base.lineFont && m.lineBorder === 'solid', JSON.stringify(m))
  }
  // A word asked, then put in the Bin: Lookups is empty again, and still shows its example (it showed the book icon).
  const word = await h.evaluate(() => window.api.captures.create({ kind: 'word', title: 'Hubris' }))
  await h.evaluate((id) => window.api.captures.save(id, { status: 'discarded', bin: true }), word)
  await go('lookups')
  await h.waitForTimeout(1200)
  const after = await measure()
  await h.screenshot({ path: `${dir}/lookups-after-a-word.png` })
  check('lookups, a word asked and binned: still the example over the band', after.example && after.band && after.lineFont === base.lineFont, JSON.stringify(after))
  check('no errors', !s.errors.length, s.errors.join(' | '))
} finally {
  await close()
}
done()
