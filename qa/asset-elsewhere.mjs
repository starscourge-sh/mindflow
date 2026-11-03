// A picture copied from another book (here: your own notes, seen from the sandbox) shows where it is pasted, rather
// than "A picture isn't here" (the user's 48bff0c1: notes copied from the sandbox prompt into a book's prompt). Its
// file was only in the other book's store; it is fetched from there and kept in this one's. A name no book has is
// still refused, and still shows the quiet "isn't here".
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 QA_ARGS=--sandbox node qa/asset-elsewhere.mjs
import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { checks } from './harness.mjs'
import { sandbox } from './sandbox-lib.mjs'
process.env.QA_ARGS ??= '--sandbox'

const { check, done } = checks()
// A small picture (36px), stored under its hash in your own notes' store only.
const png = readFileSync('resources/tray.png')
const name = `${createHash('sha256').update(png).digest('hex')}.png`
mkdirSync(join(process.env.QA_DATA, 'assets'), { recursive: true })
writeFileSync(join(process.env.QA_DATA, 'assets', name), png)
const c = await sandbox({ width: 1000, height: 760 })
const { h } = c
try {
  const here = join(process.env.QA_DATA, 'sandbox', 'assets', name)
  check('the sandbox does not have the picture to start with', !existsSync(here))
  const got = await h.evaluate(async (src) => {
    const img = new Image()
    img.src = src
    await img.decode().catch(() => {})
    return img.naturalWidth
  }, `haligtree://assets/${name}`)
  check('the picture from your own notes shows in the sandbox', got === 36, `${got}px wide`)
  check('and is kept in the sandbox’s own store now', existsSync(here))
  const none = await h.evaluate(async (src) => (await fetch(src)).status, `haligtree://assets/${'0'.repeat(64)}.png`)
  check('a picture no book has is still not found', none === 404, String(none))
} finally {
  await c.close()
}
done()
