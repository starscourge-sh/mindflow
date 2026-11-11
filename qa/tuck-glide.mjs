// A tucked goal card pointed at slides out of its tab, and the pointer gone, slides back into its edge before it is
// a tab again: one motion each way, no jump, and reversed cleanly when the pointer comes back midway. Every frame of
// the card's slide is read in its own page (its offset and opacity); paper and glass. Frames every 50ms with QA_SHOTS.
//
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox [QA_SHOTS=<dir>] node qa/tuck-glide.mjs
import { writeFileSync } from 'fs'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.HALIGTREE_QA_VIRTUAL ??= '1'

const { check, done } = checks()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const c = await sandbox()
const { electron, h } = c
const v = (channel, ...args) => h.evaluate(([one, rest]) => window.api.haligtree(one, ...rest), [channel, args])
const shots = process.env.QA_SHOTS
// In the card's page: every frame's offset (translateX) and opacity of what slides, and when it went hidden.
const RECORD = `(() => {
  window.__slide = []
  const t0 = performance.now()
  const tick = (now) => {
    const m = new DOMMatrix(getComputedStyle(document.body).transform)
    window.__slide.push({ t: Math.round(now - t0), x: Math.round(m.e * 10) / 10, o: Number(getComputedStyle(document.body).opacity), hidden: document.getElementById('root')?.style.visibility === 'hidden', w: innerWidth })
    window.__slideRaf = requestAnimationFrame(tick)
  }
  window.__slideRaf = requestAnimationFrame(tick)
})()`
const READ = '(cancelAnimationFrame(window.__slideRaf), window.__slide)'
// Jumps: a step in offset of more than a fifth of the card in one frame while it is shown.
const jumpsOf = (frames) => {
  const out = []
  for (let i = 1; i < frames.length; i++) if (!frames[i].hidden && !frames[i - 1].hidden && frames[i].w === frames[i - 1].w && Math.abs(frames[i].x - frames[i - 1].x) > frames[i].w / 5) out.push(`${frames[i].t}ms ${frames[i - 1].x}>${frames[i].x}`)
  return out
}
try {
  await wait(2500)
  await v('settings:set', { stickiesTucked: 'tabs' })
  for (const [name, set] of [['paper', { stickiesFrosted: false, stickiesGlass: false }], ['glass', { stickiesFrosted: true, stickiesGlass: true }]]) {
    await v('settings:set', set)
    await wait(3500)
    const id = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.isVisible() && /view=sticky.*type=goal/.test(w.webContents.getURL()))?.id)
    if (!id) { check(`${name}: a goal card is out`, false); continue }
    const run = (js) => electron.evaluate(({ BrowserWindow }, [wid, js]) => BrowserWindow.fromId(wid).webContents.executeJavaScript(js), [id, js])
    const film = async (label, ms) => {
      if (!shots) return wait(ms)
      const out = await electron.evaluate(async ({ BrowserWindow }, [wid, ms]) => {
        const w = BrowserWindow.fromId(wid)
        const start = Date.now()
        const got = []
        while (Date.now() - start < ms) {
          got.push({ t: Date.now() - start, png: (await w.webContents.capturePage()).toPNG().toString('base64') })
          await new Promise((r) => setTimeout(r, Math.max(0, got.length * 50 - (Date.now() - start))))
        }
        return got
      }, [id, ms])
      for (const one of out) writeFileSync(`${shots}/tuck-glide-${name}-${label}-${String(one.t).padStart(4, '0')}ms.png`, Buffer.from(one.png, 'base64'))
    }
    // Pointed at: out of its tab. The pointer is never on the parked window, so main folds it back half a second on.
    await run(RECORD)
    await run('window.api.holdBeacon(true)')
    await film('out-and-back', 1800)
    await wait(shots ? 300 : 2100)
    const both = await run(READ)
    const shown = both.filter((one) => !one.hidden)
    const outFrames = shown.filter((one) => one.o > 0.55)
    const firstOut = shown.findIndex((one) => one.w > 200)
    const settled = shown.findIndex((one, i) => i > firstOut && Math.abs(one.x) < 0.5 && one.o > 0.99)
    const lastOpen = shown.reduce((at, one, i) => (one.w > 200 ? i : at), -1)
    console.log(`  ${name}: ${both.length} frames; out from ${shown[firstOut]?.x}px to rest in ${shown[settled]?.t - shown[firstOut]?.t}ms; back to ${shown[lastOpen]?.x}px at opacity ${shown[lastOpen]?.o?.toFixed(2)} before it is a tab`)
    check(`${name}: it slides out of its tab, from its edge to its place`, firstOut >= 0 && Math.abs(shown[firstOut].x) > 20 && settled > firstOut, `${shown[firstOut]?.x} then ${settled}`)
    check(`${name}: and slides back into its edge, faded, before it becomes a tab (never vanishes whole)`, lastOpen > settled && Math.abs(shown[lastOpen].x) > 20 && shown[lastOpen].o < 0.3, JSON.stringify(shown[lastOpen]))
    check(`${name}: no jump either way`, jumpsOf(both).length === 0, jumpsOf(both).join(', '))
    const tab = await electron.evaluate(({ BrowserWindow }, wid) => BrowserWindow.fromId(wid).getBounds().width, id)
    check(`${name}: a tab again at the end`, tab < 120, `${tab}px wide`)
    void outFrames
    // The pointer back midway through the slide back: it turns round from where it is and goes out again.
    await run(RECORD)
    await run('window.api.holdBeacon(true)')
    await wait(620)
    await electron.evaluate(({ BrowserWindow }, wid) => BrowserWindow.fromId(wid).webContents.send('beacon:fold', false), id)
    await wait(500)
    const back = await run(READ)
    const turned = back.filter((one) => !one.hidden && one.w > 200)
    let peak = 0
    for (const one of turned) if (Math.abs(one.x) > Math.abs(peak) && turned.indexOf(one) > turned.findIndex((f) => Math.abs(f.x) < 0.5)) peak = one.x
    const end = turned[turned.length - 1]
    check(`${name}: caught midway, it turns round and is out again`, !!end && Math.abs(end.x) < 1 && end.o > 0.98 && Math.abs(peak) > 2, `went ${peak}px toward the edge, ended ${end?.x}px at ${end?.o}`)
    check(`${name}: and turning round has no jump`, jumpsOf(back).length === 0, jumpsOf(back).join(', '))
    await wait(2500)
  }
} finally {
  await c.close()
}
done()
