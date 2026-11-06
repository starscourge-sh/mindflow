// Profiles a page visit on a real-sized book and prints where the time went (self time by function and file).
//   PAGE=media QA_ARGS='' QA_DATA=<copy> QA_ENTRY=$PWD/out-dev/main/index.js HALIGTREE_QA_AWAY=1 node qa/freeze-profile.mjs
import { sandbox } from './sandbox-lib.mjs'
const page = process.env.PAGE ?? 'media'
const { h, go, close } = await sandbox({ width: 1440, height: 900, seeded: false })
try {
  const cdp = await h.context().newCDPSession(h)
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
  for (let round = 0; round < 4; round++) {
    await go('inbox')
    await cdp.send('Profiler.start')
    const at = Date.now()
    await Promise.race([go(page), new Promise((done) => setTimeout(done, 12000))])
    await h.evaluate(() => new Promise((done) => requestAnimationFrame(() => done())))
    const took = Date.now() - at
    const { profile } = await cdp.send('Profiler.stop')
    if (took < 3500) { console.log(`round ${round}: ${took} ms, quick`); continue }
    const self = new Map(); const dt = profile.timeDeltas; const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    profile.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber}`; self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000) })
    console.log(`round ${round}: ${took} ms`)
    for (const [k, ms] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${Math.round(ms)} ms  ${k}`)
    // Who calls the heaviest: the chain up from its nodes.
    break
  }
} finally { await close() }
