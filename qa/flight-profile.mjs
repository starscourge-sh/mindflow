// Profiles turning a note into a task by its button, and prints where the main thread's time went for 2.5 seconds.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/flight-profile.mjs
import { sandbox } from './sandbox-lib.mjs'
const { h, go, close } = await sandbox({ width: 1600, height: 900 })
const wait = (ms) => h.waitForTimeout(ms)
try {
  await go('inbox')
  await wait(1500)
  await h.evaluate(() => window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Flight probe note' }] }] } }))
  await wait(800)
  await h.locator('[data-id]', { hasText: 'Flight probe note' }).first().click()
  await wait(1200)
  await h.locator('button[aria-label="Details"]').first().click()
  await wait(1500)
  const cdp = await h.context().newCDPSession(h)
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
  await cdp.send('Profiler.start')
  await h.getByRole('button', { name: 'Make it a task' }).first().click({ timeout: 5000 })
  await wait(2500)
  const { profile } = await cdp.send('Profiler.stop')
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const kid of n.children ?? []) parent.set(kid, n.id)
  const label = (n) => { const f = n.callFrame; return `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}` }
  const self = new Map(); const total = new Map()
  profile.samples.forEach((id, i) => {
    const ms = (profile.timeDeltas[i] ?? 0) / 1000
    const n = byId.get(id)
    self.set(label(n), (self.get(label(n)) ?? 0) + ms)
    const seen = new Set()
    for (let at = id; at; at = parent.get(at)) { const key = label(byId.get(at)); if (!seen.has(key)) (seen.add(key), total.set(key, (total.get(key) ?? 0) + ms)) }
  })
  const top = (map, n) => [...map].filter(([k]) => !/^\((idle|root|program)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, ms]) => `  ${Math.round(ms)} ms  ${k}`).join('\n')
  console.log('SELF\n' + top(self, 14))
  console.log('INCLUDING WHAT THEY CALL\n' + top(total, 40))
} finally { await close() }
