// A YouTube card whose thumbnail is the real shape: 480x360 jpg, 45px black bands over and under.
import { sandbox } from './sandbox-lib.mjs'
const OUT = '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/reader'
const s = await sandbox({ width: 1200, height: 800 })
const { h, errors } = s
try {
  const image = await h.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 360
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 480, 360)
    const grad = g.createLinearGradient(0, 0, 480, 0); grad.addColorStop(0, '#e64a19'); grad.addColorStop(1, '#1e88e5')
    g.fillStyle = grad; g.fillRect(0, 45, 480, 270); g.fillStyle = '#fff'; g.beginPath(); g.arc(240, 180, 40, 0, 7); g.fill()
    return c.toDataURL('image/jpeg', 0.9)
  })
  const card = (img, title) => ({ type: 'bookmark', attrs: { href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title, description: 'A lecture on attention and reading, with questions from the room at the end, and a long description that runs onto a second line so the card is taller.', image: img, site: 'YouTube' } })
  const body = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Thumbnails' }] },
    card(image, 'Kept 4:3 thumbnail with bands'),
    card('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', 'Remote hqdefault'),
  ] }
  const id = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }).then((c) => c.id ?? c), body)
  for (const theme of ['light', 'dark']) {
    await s.theme(theme)
    for (const pics of ['fill', 'whole']) {
      await h.evaluate((p) => window.api.vigil('settings:set', { linkPictures: p }), pics)
      await s.send('capture', id); await h.waitForTimeout(2500)
      const info = await h.evaluate(() => [...document.querySelectorAll('.tiptap-bookmark-image')].map((i) => [i.src.slice(0, 50), i.closest('.tiptap-bookmark-frame').hasAttribute('data-banded'), getComputedStyle(i).objectViewBox, getComputedStyle(i).objectFit]))
      console.log(theme, pics, JSON.stringify(info))
      await h.screenshot({ path: `${OUT}/6-bands-${pics}-${theme}.png` })
    }
  }
  await h.evaluate(() => window.api.vigil('settings:set', { linkPictures: 'fill' }))
  console.log('errors', errors.slice(0, 5))
} catch (e) { console.error(e) } finally { await s.close() }
