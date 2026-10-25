// The Map and the side panel's Links graph in Paper, GitHub Dark and Brutal,
// and how long a frame takes with 600 notes on the map.
//   QA_DATA=$(mktemp -d) QA_ARGS=--sandbox QA_ENTRY=out-map2/main/index.js SHOTS=<dir> TAG=after node qa/map-looks.mjs
import { mkdirSync } from 'fs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const dir = process.env.SHOTS ?? `${process.env.QA_DATA}/shots`
const tag = process.env.TAG ?? 'shot'
mkdirSync(dir, { recursive: true })
const c = await sandbox({ width: 1280, height: 860 })
const { h, v, go } = c
try {
  const map = await v('notes:graph:all')
  console.log(`map: ${map.nodes.length} notes, ${map.edges.length} links, ${map.nodes.filter((n) => n.tag).length} tinted, ${map.nodes.filter((n) => n.picture).length} with a picture`)
  const looks = [['paper', 'soft'], ['github', 'soft'], ['paper', 'brutal']]
  for (const [theme, style] of looks) {
    await h.evaluate((s) => (s === 'brutal' ? localStorage.setItem('style', 'brutal') : localStorage.removeItem('style')), style)
    await c.theme(theme)
    await c.size(1280, 860)
    await h.evaluate(() => (localStorage.setItem('noteDetails', 'open'), window.dispatchEvent(new Event('mf:details'))))
    await go('map')
    await h.waitForTimeout(3500)
    await h.mouse.move(5, 5)
    const name = `${tag}-${theme}${style === 'brutal' ? '-brutal' : ''}`
    await h.screenshot({ path: `${dir}/${name}.png` })
    // The busiest note's own Links graph in the side panel.
    const hub = [...map.nodes].filter((n) => n.type === 'capture').sort((a, b) => b.links - a.links)[0]
    if (hub) {
      await c.send(hub.type === 'capture' ? 'capture' : hub.type, hub.id)
      await h.waitForTimeout(2500)
      const graph = await h.$('[data-local-graph]')
      if (graph) { await graph.scrollIntoViewIfNeeded(); await h.waitForTimeout(1200); await graph.screenshot({ path: `${dir}/${name}-panel.png` }) }
      else (console.log('no local graph shown for', hub.title), await h.screenshot({ path: `${dir}/${name}-nopanel.png` }))
    }
  }
  // 600 notes and 900 links in place of the sandbox's.
  await h.evaluate(() => localStorage.removeItem('style'))
  await c.theme('github')
  await go('home')
  await c.electron.evaluate(({ ipcMain }) => {
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const kinds = ['note', 'note', 'note', 'quote', 'word', 'link', 'decision', 'experiment', 'todo']
    const tags = [undefined, undefined, ['book', 'brown'], ['bug', 'red'], ['idea', 'green'], ['work', 'blue']]
    const nodes = Array.from({ length: 600 }, (_, i) => { const t = tags[i % 6]; return { type: 'capture', id: `n${i}`, title: `Note number ${i}`, kind: kinds[i % 9], links: 0, ...(t ? { tag: t[0], tint: t[1] } : {}) } })
    const edges = []
    for (let i = 1; i < 600; i++) edges.push([`n${Math.floor(random() * i)}`, `n${i}`, 1 + Math.floor(random() * 3)])
    for (let i = 0; i < 300; i++) edges.push([`n${Math.floor(random() * 600)}`, `n${Math.floor(random() * 600)}`, 1])
    const ok = edges.filter(([a, b]) => a !== b)
    for (const [a, b] of ok) (nodes[+a.slice(1)].links++, nodes[+b.slice(1)].links++)
    ipcMain.removeHandler('haligtree:notes:graph:all')
    ipcMain.handle('haligtree:notes:graph:all', () => ({ nodes, edges: ok, alone: 0 }))
  })
  // How long each drawing takes, timed from the canvas's clear to the end of that task.
  await h.evaluate(() => {
    const proto = CanvasRenderingContext2D.prototype, clear = proto.clearRect
    window.__draws = []
    proto.clearRect = function (...a) { if (this.canvas.isConnected && this.canvas.width > 600) { const t = performance.now(); queueMicrotask(() => window.__draws.push(performance.now() - t)) } return clear.apply(this, a) }
  })
  const phase = async (label, ms, during) => {
    await h.evaluate(() => (window.__draws = []))
    const busy = during?.()
    await h.waitForTimeout(ms)
    await busy
    const took = await h.evaluate(() => window.__draws)
    const s = [...took].sort((a, b) => a - b)
    console.log(`${label}: ${took.length} drawings in ${ms / 1000}s${s.length ? `, each median ${s[Math.floor(s.length / 2)].toFixed(2)}ms, 95th ${s[Math.floor(s.length * 0.95)].toFixed(2)}ms, slowest ${s.at(-1).toFixed(2)}ms` : ''}`)
  }
  await go('map')
  await phase('600 dots settling', 1500)
  await h.waitForTimeout(5000)
  await phase('600 dots settled', 2000)
  const box = await h.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })
  await phase('600 dots, pointer moving', 1500, async () => { for (let i = 0; i < 60; i++) { await h.mouse.move(box[0] + box[2] * (0.2 + i / 100), box[1] + box[3] * 0.5); await h.waitForTimeout(16) } })
  await phase('600 dots, zooming', 1500, async () => { await h.keyboard.down('Meta'); for (let i = 0; i < 10; i++) { await h.mouse.wheel(0, i < 5 ? -60 : 60); await h.waitForTimeout(60) } await h.keyboard.up('Meta') })
  await h.mouse.move(5, 5)
  await h.screenshot({ path: `${dir}/${tag}-many.png` })
  if (c.errors.length) console.log('errors:', c.errors.slice(0, 5))
} finally {
  await c.close()
}
