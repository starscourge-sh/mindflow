// Files' Audio, each day's recordings in one island as Queue's "Up next" (user 8 Nov: "we should use the island system,
// because right now its all just text html elements on the screen"), and the playhead's stick and dot clear of the
// row's highlight (user: "notice how the stick touches the edge of the highlight (never a good idea)"). Checks: the
// stick and dot at least 6px inside the highlight, hovered and picked; the time, speed and clock columns line up within
// 1px down the rows, "1×" on the time's line; the island's radius, border and surface the Queue island's; at 500px wide
// nothing runs off sideways. Shots light and dark beside the Queue page, wide and narrow.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/audio-islands.mjs [shots]
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'

const { check, done } = checks()
const SHOTS = process.argv[2]
const c = await sandbox({ width: 1180, height: 820 })
const { h, go, electron, size, both, look } = c
const shot = async (name) => SHOTS && both(join(SHOTS, name))

const wav = () => {
  const b = Buffer.alloc(44 + 8000)
  b.write('RIFF', 0); b.writeUInt32LE(36 + 8000, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34)
  b.write('data', 36); b.writeUInt32LE(8000, 40)
  for (let i = 0; i < 8000; i++) b[44 + i] = 128 + Math.round(90 * Math.sin(i / 6) * Math.sin(i / 900))
  return [...b]
}
const store = await electron.evaluate(({ app }) => process.mainModule.require('path').join(app.getPath('userData'), 'assets'))
const real = await c.v('media:list')
const note = real.find((one) => one.uses.length)?.uses[0] ?? null
const files = []
for (let i = 0; i < 9; i++) {
  const name = `${createHash('sha256').update(`aud${i}`).digest('hex')}.wav`
  await electron.evaluate((_, [dir, name, bytes]) => { const fs = process.mainModule.require('fs'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(process.mainModule.require('path').join(dir, name), Buffer.from(bytes)) }, [store, name, wav()])
  const used = note && i % 3 !== 0
  files.push({ src: `haligtree://assets/${name}`, kind: 'audio', name: i === 4 ? 'An interview about the long history of the commonplace book.wav' : `Voice note ${i}.wav`, size: 1000, type: used ? note.type : '', id: used ? note.id : '', title: used ? note.title : '', private: false, near: '', at: new Date(Date.now() - i * 11 * 3600_000).toISOString(), uses: used ? [note] : [], added: !used, gone: false })
}
await electron.evaluate(({ ipcMain }, list) => { ipcMain.removeHandler('haligtree:media:list'); ipcMain.handle('haligtree:media:list', () => list) }, files)

const measure = () => h.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-media-grid] [data-media="audio"]')]
  const box = (el) => el.getBoundingClientRect()
  return rows.map((row) => {
    const r = box(row)
    const head = row.querySelector('[data-playhead]')
    const dot = getComputedStyle(head, '::before')
    const hb = box(head)
    // The dot: its own top (-3px) and its 2px ring above the stick's top.
    const dotTop = hb.top + parseFloat(dot.top) - 2
    const time = row.querySelector('[data-sound-time]'), speed = row.querySelector('[data-speed]'), clock = row.querySelector('.files-audio-time'), wave = row.querySelector('[data-wave]')
    return {
      top: Math.round((Math.min(dotTop, hb.top) - r.top) * 10) / 10, bottom: Math.round((r.bottom - hb.bottom) * 10) / 10,
      left: Math.round((box(row.querySelector('[data-sound-play]')).left - r.left) * 10) / 10, right: Math.round((r.right - box(clock).right) * 10) / 10,
      timeRight: box(time).right, speedRight: box(speed).right, clockRight: box(clock).right, waveLeft: box(wave).left, waveRight: box(wave).right,
      sameLine: Math.abs(box(time).top + box(time).height / 2 - (box(speed).top + box(speed).height / 2)) < 2,
      piece: row.parentElement.closest('[data-audio-island]')?.dataset.audioIsland
    }
  })
})
const surface = (sel) => h.evaluate((sel) => {
  const el = document.querySelector(sel)
  if (!el) return null
  const s = getComputedStyle(el)
  return { radius: s.borderTopLeftRadius, border: s.borderTopColor, width: s.borderLeftWidth, bg: s.backgroundColor }
}, sel)
const aligned = (list, key) => Math.max(...list.map((r) => r[key])) - Math.min(...list.map((r) => r[key])) <= 1

try {
  for (const name of ['light', 'dark']) {
    await look(name)
    await go('queue')
    await h.waitForTimeout(900)
    const queue = await surface('.mf-island')
    if (SHOTS) await h.screenshot({ path: join(SHOTS, `queue-${name}.png`) })
    await go('home')
    await go('media')
    await h.waitForTimeout(1500)
    if (SHOTS) await h.screenshot({ path: join(SHOTS, `media-${name}.png`) })
    // With only recordings, the page shows their pile and no tabs: the pile opens Audio.
    await h.getByText(/^Audio$/).first().click()
    await h.waitForTimeout(1200)
    const audio = await surface('[data-audio-island="top"], [data-audio-island="one"]')
    check(`${name}: the day's island is Queue's (radius, border, surface)`, JSON.stringify(queue) === JSON.stringify(audio), `${JSON.stringify(queue)} vs ${JSON.stringify(audio)}`)
    const rows = await measure()
    check(`${name}: rows drawn in islands`, rows.length >= 6 && rows.every((r) => r.piece), rows.map((r) => r.piece).join(','))
    check(`${name}: stick and dot at least 6px inside the highlight, top and bottom`, rows.every((r) => r.top >= 6 && r.bottom >= 6), rows.map((r) => `${r.top}/${r.bottom}`).join(' '))
    check(`${name}: play button and clock at least 6px inside the highlight's sides`, rows.every((r) => r.left >= 6 && r.right >= 6), rows.map((r) => `${r.left}/${r.right}`).join(' '))
    check(`${name}: waveform, time, speed and clock line up across rows within 1px`, ['waveLeft', 'waveRight', 'timeRight', 'speedRight', 'clockRight'].every((k) => aligned(rows, k)), JSON.stringify(rows.map((r) => [r.waveLeft, r.timeRight, r.speedRight, r.clockRight].map(Math.round))))
    check(`${name}: "1×" sits on the time's line`, rows.every((r) => r.sameLine))
    // Hovered: the dot grows; still clear.
    const first = h.locator('[data-media-grid] [data-media="audio"] [data-wave]').first()
    await first.hover()
    await h.waitForTimeout(250)
    const hovered = (await measure())[0]
    const grown = await h.evaluate(() => { const head = document.querySelector('[data-media-grid] [data-playhead]'); const dot = head.getBoundingClientRect(); const row = head.closest('[data-media="audio"]').getBoundingClientRect(); const before = getComputedStyle(head, '::before'); return Math.round((dot.top + parseFloat(before.top) - 2 - (parseFloat(before.width) * (parseFloat(before.scale) || 1) - parseFloat(before.width)) / 2 - row.top) * 10) / 10 })
    check(`${name}: hovered, the grown dot still 6px clear`, grown >= 6, `${grown} (${hovered.top})`)
    if (SHOTS) await h.screenshot({ path: join(SHOTS, `audio-hover-${name}.png`) })
    await h.mouse.move(5, 5)
    if (SHOTS) await h.screenshot({ path: join(SHOTS, `audio-${name}.png`) })
    // Narrow: the page about 500px wide (the window's least is 560; the sidebar folds).
    await size(560, 700)
    await h.waitForTimeout(600)
    const narrow = await h.evaluate(() => {
      let el = document.querySelector('[data-media-grid]'); while (el && !/auto|scroll/.test(getComputedStyle(el).overflowY)) el = el.parentElement
      const grid = document.querySelector('[data-media-grid]').getBoundingClientRect()
      const outside = [...document.querySelectorAll('[data-media-grid] [data-media="audio"] *')].filter((one) => { const b = one.getBoundingClientRect(); return b.width && (b.right > grid.right + 0.5 || b.left < grid.left - 0.5) }).length
      return { sideways: el ? el.scrollWidth - el.clientWidth : -1, outside, wave: Math.round(document.querySelector('[data-media-grid] [data-wave]').getBoundingClientRect().width), width: Math.round(grid.width) }
    })
    check(`${name}: narrow, nothing runs off sideways and the waveform shrinks`, narrow.sideways <= 0 && narrow.outside === 0 && narrow.wave > 40, JSON.stringify(narrow))
    const nrows = await measure()
    check(`${name}: narrow, stick and dot still 6px inside`, nrows.every((r) => r.top >= 6 && r.bottom >= 6 && r.left >= 6 && r.right >= 6), nrows.map((r) => `${r.top}/${r.bottom}/${r.left}/${r.right}`).join(' '))
    if (SHOTS) await h.screenshot({ path: join(SHOTS, `audio-560-${name}.png`) })
    await go('queue')
    await h.waitForTimeout(700)
    if (SHOTS) await h.screenshot({ path: join(SHOTS, `queue-560-${name}.png`) })
    await size(1180, 820)
  }
  // The same player in a note, a recording's card: its stick and dot clear of the card's edge too, hovered as well.
  const id = await c.v('article:new')
  await c.v('item:save', id, { title: 'With a recording', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Said aloud' }] }, { type: 'attachment', attrs: { src: files[0].src, name: 'Voice note.wav', size: 8044, duration: 1 } }, { type: 'paragraph' }] } })
  for (const name of ['light', 'dark']) {
    await look(name)
    await c.send('article', id)
    await h.waitForTimeout(2000)
    const wave = h.locator('[data-open] .tiptap-attachment.is-audio [data-wave]').first()
    await wave.hover()
    await h.waitForTimeout(250)
    const inNote = await h.evaluate(() => {
      const card = document.querySelector('[data-open] .tiptap-attachment.is-audio .tiptap-attachment-card').getBoundingClientRect()
      const head = document.querySelector('[data-open] .tiptap-attachment.is-audio [data-playhead]')
      const b = head.getBoundingClientRect(), dot = getComputedStyle(head, '::before')
      const grow = (parseFloat(dot.width) * ((parseFloat(dot.scale) || 1) - 1)) / 2
      return { top: Math.round((b.top + parseFloat(dot.top) - 2 - grow - card.top) * 10) / 10, bottom: Math.round((card.bottom - b.bottom) * 10) / 10 }
    })
    check(`${name}: in a note, the stick and grown dot at least 6px inside the recording's card`, inNote.top >= 6 && inNote.bottom >= 6, JSON.stringify(inNote))
    if (SHOTS) await h.locator('[data-open] .tiptap-attachment.is-audio').first().screenshot({ path: join(SHOTS, `note-audio-${name}.png`) })
  }
} finally {
  await c.close()
}
done()
