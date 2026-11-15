// The frames a page itself drew, kept as pictures: a picture asked of a window takes 120ms or more, longer than most of
// what moves here lasts, so the page's own frames are taken as it shows them (the browser's screencast), each named by
// its milliseconds since the act began. Shared by qa/cal-add.mjs, qa/pdf-peek-first-sweep.mjs and qa/start-time.mjs.
import { mkdirSync, writeFileSync } from 'node:fs'

/** Every frame `page` draws from now on, as [ms since 1970, JPEG as base64], until `stop()`, which hands them over. */
export async function cast(page) {
  const cdp = await page.context().newCDPSession(page)
  const got = []
  cdp.on('Page.screencastFrame', (frame) => { got.push([frame.metadata.timestamp * 1000, frame.data]); cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {}) })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90 })
  return {
    async stop() {
      await cdp.send('Page.stopScreencast').catch(() => {})
      await cdp.detach().catch(() => {})
      return got
    }
  }
}

/** Runs `run` on `page` and keeps every frame drawn from just before it to `ms` after, in `dir`, as `<name>-<ms>ms.jpg`. */
export async function castFrames(page, dir, name, run, ms = 450) {
  mkdirSync(dir, { recursive: true })
  const casting = await cast(page)
  await page.waitForTimeout(250)
  const t0 = Date.now()
  await run()
  await page.waitForTimeout(ms)
  const got = await casting.stop()
  const kept = got.filter(([at]) => at >= t0 - 30 && at <= t0 + ms + 150)
  for (const [at, data] of kept) writeFileSync(`${dir}/${name}-${String(Math.max(0, Math.round(at - t0))).padStart(3, '0')}ms.jpg`, Buffer.from(data, 'base64'))
  console.log(`NOTE  ${name}: ${kept.length} of the page's own frames kept, drawn ${kept.map(([at]) => Math.max(0, Math.round(at - t0))).join(' ')}ms after the act was asked for`)
}
