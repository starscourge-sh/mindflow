import { parentPort, workerData } from 'node:worker_threads'
import { readPage } from './article-read'
import type { Kept, Missed } from './article-clean'

/**
 * One page read on a thread of its own (web-articles.ts starts it): its article
 * told to main, then each picture's place judged as main brings it, and the
 * whole article once they are all settled. No Electron here.
 */
const port = parentPort!
const { page, href, url } = workerData as { page: string; href: string; url: string }
const done = readPage(page, href, url)
if ('error' in done) port.postMessage({ error: done.error })
else {
  port.postMessage({ read: done.read })
  port.on('message', (ask: { at: number; got: Kept | Missed } | { finish: true }) =>
    port.postMessage({ html: 'finish' in ask ? done.finish() : done.judge(ask.at, ask.got) })
  )
}
