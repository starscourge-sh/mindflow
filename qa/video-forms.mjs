// Every way a YouTube picture shows in a note: the player, a picture by its ytimg address
// (hqdefault, 0.jpg, with ?sqp=), a banded picture kept with the note, and a link card.
import { sandbox } from './sandbox-lib.mjs'
const OUT = '/private/tmp/claude-501/-Users-starscourge-Documents-forge-mindflow/703b99ba-c755-40e3-a385-896560d19061/scratchpad/reader'
const TAG = process.env.TAG ?? 'after'
const s = await sandbox({ width: 1200, height: 900 })
const { h, errors } = s
try {
  const banded = await h.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 360
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 480, 360)
    const grad = g.createLinearGradient(0, 0, 480, 0); grad.addColorStop(0, '#e64a19'); grad.addColorStop(1, '#1e88e5')
    g.fillStyle = grad; g.fillRect(0, 45, 480, 270); g.fillStyle = '#fff'; g.beginPath(); g.arc(240, 180, 40, 0, 7); g.fill()
    return c.toDataURL('image/jpeg', 0.9)
  })
  const p = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  const img = (src) => ({ type: 'image', attrs: { src } })
  const body = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Introduction to Amazon Sagemaker Studio' }] },
    p('1. The player'), { type: 'youtube', attrs: { src: 'https://www.youtube.com/watch?v=YcJAc-x8XLQ' } },
    p('2. hqdefault by address'), img('https://i.ytimg.com/vi/YcJAc-x8XLQ/hqdefault.jpg'),
    p('3. 0.jpg by address'), img('https://img.youtube.com/vi/YcJAc-x8XLQ/0.jpg'),
    p('4. hqdefault with ?sqp='), img('https://i.ytimg.com/vi/YcJAc-x8XLQ/hqdefault.jpg?sqp=-oaymwEcCNACELwBSFXyq4qpAw4IARUAAIhCGAFwAcABBg==&rs=AOn4CLA'),
    p('5. a banded picture kept with the note'), img(banded),
    p('6. link card'), { type: 'bookmark', attrs: { href: 'https://www.youtube.com/watch?v=YcJAc-x8XLQ', title: 'Introduction to Amazon Sagemaker Studio', description: 'AWS', image: 'https://i.ytimg.com/vi/YcJAc-x8XLQ/hqdefault.jpg', site: 'YouTube' } },
  ] }
  const id = await h.evaluate((b) => window.api.captures.create({ kind: 'note', body: b }).then((c) => c.id ?? c), body)
  await s.send('capture', id); await h.waitForTimeout(4000)
  const saved = await h.evaluate((id) => window.api.captures.get(id).then((c) => (c.body.content ?? []).filter((n) => n.type === 'image' || n.type === 'bookmark').map((n) => String(n.attrs.src ?? n.attrs.image).slice(0, 60))), id)
  console.log('saved srcs', saved)
  console.log(JSON.stringify(await h.evaluate(() => [...document.querySelectorAll('.tiptap.ProseMirror img')].map((i) => ({ src: i.src.slice(0, 50), n: [i.naturalWidth, i.naturalHeight], box: [Math.round(i.getBoundingClientRect().width), Math.round(i.getBoundingClientRect().height)], banded: i.hasAttribute('data-banded') || !!i.closest('[data-banded]'), ovb: getComputedStyle(i).objectViewBox })))))
  for (const theme of ['light', 'dark']) {
    await s.theme(theme)
    await s.send('capture', id); await h.waitForTimeout(3500)
    const shots = ['1. The player', '3. 0.jpg', '5. a banded', '6. link card']
    for (const [i, label] of shots.entries()) {
      await h.evaluate((label) => [...document.querySelectorAll('.tiptap.ProseMirror p')].find((x) => x.textContent.startsWith(label))?.scrollIntoView({ block: 'start' }), label)
      await h.waitForTimeout(500)
      await h.screenshot({ path: `${OUT}/7-${TAG}-${i + 1}-${theme}.png` })
    }
  }
  console.log('errors', errors.slice(0, 5))
} catch (e) { console.error(e) } finally { await s.close() }
