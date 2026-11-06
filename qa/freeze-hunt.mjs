// Walks every page of a real-sized book and says which one stops answering (a list measuring its rows for ever,
// an effect that never settles). Point QA_DATA at a copy of a book; QA_ARGS='' runs it as that book, not the sandbox.
//   QA_ARGS='' QA_DATA=<copy> QA_ENTRY=$PWD/out-dev/main/index.js HALIGTREE_QA_AWAY=1 node qa/freeze-hunt.mjs
import { sandbox } from './sandbox-lib.mjs'

const PAGES = (process.env.PAGES ?? 'inbox home day weekpage monthpage yearpage articles questions nuggets review today calendar feed goals queue tags sources stats map media discarded archived').split(' ')
const { h, go, size, close } = await sandbox({ width: 1440, height: 900, seeded: false })
// One frame's round trip, or null when the page doesn't answer within the limit.
const answers = (limit = 4000) => Promise.race([
  h.evaluate(() => new Promise((done) => { const at = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => done(Math.round(performance.now() - at)))) })),
  new Promise((done) => setTimeout(() => done(null), limit))
])
const stuck = []
try {
  for (const [w, hh] of [[1440, 900], [1000, 800]]) {
    await size(w, hh)
    for (const id of PAGES) {
      const sent = Date.now()
      await Promise.race([go(id), new Promise((done) => setTimeout(done, 6000))])
      const ms = await answers()
      // A quiet second, then again: a loop keeps the page busy after it has drawn.
      await new Promise((done) => setTimeout(done, 1000))
      const again = await answers()
      console.log(`${w} ${id.padEnd(10)} ${Date.now() - sent} ms to arrive, frame ${ms ?? 'NO ANSWER'} then ${again ?? 'NO ANSWER'}`)
      if (ms === null || again === null || again > 250) stuck.push(`${w} ${id}`)
      if (ms === null && again === null) break
    }
  }
} finally {
  console.log(stuck.length ? `STUCK: ${stuck.join(', ')}` : 'every page answered')
  await close()
}
