// "Send to Haligtree" for files, from Finder's right-click (Quick Actions or Services; every Mac, no Xcode:
// an NSServices entry in Info.plist, handled by native/services.mm): files sent through the app's own
// services provider, the path macOS calls, come in as opened with Haligtree: a picture becomes a note in
// the Inbox holding it, a PDF joins the library. The menu line is listed by macOS only for the app in
// /Applications: not driven here; electron-builder.yml is checked to declare it.
//   QA_ARGS=--sandbox QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/mac-finder.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { sandbox } from './sandbox-lib.mjs'
import { checks } from './harness.mjs'

const { check, done } = checks()
const yml = readFileSync(new URL('../electron-builder.yml', import.meta.url), 'utf8')
check('Info.plist declares the Finder line for pictures, PDFs, Markdown and text', /NSMessage: sendFilesToHaligtree[\s\S]*NSSendFileTypes:[\s\S]*public\.image[\s\S]*com\.adobe\.pdf/.test(yml))
const c = await sandbox({ width: 1100, height: 800 })
const { h, electron, v } = c
try {
  const picture = fileURLToPath(new URL('./fixtures/notebook-page.png', import.meta.url))
  const pdf = fileURLToPath(new URL('./fixtures/scanned-book.pdf', import.meta.url))
  check('the app answers Finder’s line', await electron.evaluate(() => typeof globalThis.servicesSendFiles === 'function'))
  await electron.evaluate((_, paths) => globalThis.servicesSendFiles(paths), [picture, pdf].join('\n'))
  let note = null
  for (let i = 0; i < 30 && !note; i++) {
    await h.waitForTimeout(250)
    note = await h.evaluate(async () => (await window.api.captures.list()).find((one) => one.label === 'notebook-page') ?? null)
  }
  const body = note ? await h.evaluate((id) => window.api.captures.get(id).then((one) => JSON.stringify(one?.body)), note.id) : ''
  check('a picture becomes a note in the Inbox holding it', note?.status === 'open' && /"type":"image"/.test(body) && /haligtree:\/\/assets\//.test(body), `${JSON.stringify(note)?.slice(0, 120)} ${body.slice(0, 160)}`)
  const library = await v('pdf:library')
  check('a PDF joins the library', library.some((one) => /scanned-book/.test(one.name ?? one.title ?? '')), JSON.stringify(library.map((one) => one.name ?? one.title)).slice(0, 200))
  check('no page errors', !c.errors.length, c.errors.slice(0, 3).join(' | '))
} finally {
  await c.close()
}
done()
