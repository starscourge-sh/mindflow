/**
 * What a document says it points at.
 *
 * `referencesOf` is what a host asks before moving a note anywhere else, so it
 * is checked against a document the editor actually built rather than one
 * written by hand: a picture, an attachment, a drawing with a picture pasted
 * into it, a link card and a link to another note.
 */
import { build } from 'esbuild'

import { open } from './harness.mjs'

const app = await open()
const { page } = app
await app.reset()

// Built as JSON and put in through the editor's own schema, so anything the
// schema would reject fails here rather than passing quietly.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
// A different picture, or the two would dedupe into one reference - which is
// correct, and would hide what this case is checking.
const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const built = await page.evaluate(({ png, gif }) => {
  // Tiptap hangs the editor off its own DOM node, which is the only handle
  // this harness has on it from outside.
  const editor = document.querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)').editor
  if (!editor) return null

  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'a note with things in it' }] },
      { type: 'image', attrs: { src: 'mindflow://assets/aaaa.png' } },
      { type: 'attachment', attrs: { src: 'mindflow://assets/bbbb.pdf', name: 'spec.pdf', size: 1234 } },
      {
        type: 'excalidraw',
        attrs: { height: 300, scene: { elements: [], files: { f1: { dataURL: png, mimeType: 'image/png' } } } }
      },
      {
        type: 'bookmark',
        attrs: {
          href: 'https://example.com',
          title: 'Example',
          // One of each: a remote one, which nothing here can reach and so
          // must be left alone, and an inline one, which must move.
          image: 'https://example.com/card.png',
          icon: gif
        }
      },
      { type: 'paragraph', content: [{ type: 'noteLink', attrs: { id: 'note-42', label: 'Another note' } }] }
    ]
  }
  editor.commands.setContent(doc)
  return true
}, { png: PNG, gif: GIF })

if (!built) {
  console.log('could not reach the editor view')
  await app.close()
  process.exit(1)
}
await page.waitForTimeout(800)

// The real module, compiled rather than copied, so this cannot pass against a
// stale paraphrase of it.
const { outputFiles } = await build({
  entryPoints: ['src/renderer/src/lib/document.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'documentModule',
  write: false
})
const module = outputFiles[0].text

const stored = await page.evaluate(
  ({ code }) => {
    const doc = document
      .querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)')
      .pmViewDesc.node.toJSON()
    // eslint-disable-next-line no-new-func
    const run = new Function(`${code}; return documentModule`)()
    return {
      refs: run.referencesOf(doc).map((r) => ({ kind: r.kind, src: r.src.slice(0, 44), size: r.size })),
      assets: run.assetsOf(doc).length,
      inline: run.inlineBytes(doc)
    }
  },
  { code: module }
)

for (const ref of stored.refs) console.log(`${ref.kind.padEnd(15)} ${ref.src}${ref.size ? `  (${ref.size}B)` : ''}`)
console.log(`\nassetsOf: ${stored.assets} (expect 2)`)
console.log(`inlineBytes: ${stored.inline} (the drawing's picture, not the text)`)

const kinds = stored.refs.map((r) => r.kind).sort()
const want = ['attachment', 'bookmark-icon', 'bookmark-image', 'diagram-image', 'image', 'note']
console.log(`\nRESULT every kind found: ${JSON.stringify(kinds) === JSON.stringify(want)}`)

// And `localise` puts what it can into the host's store. Run against the real
// host, so the URLs that come back are ones the app can actually read.
const after = await page.evaluate(
  async ({ code }) => {
    const doc = document
      .querySelector('.tiptap.ProseMirror.mindflow-editor:not(.is-line)')
      .pmViewDesc.node.toJSON()
    // eslint-disable-next-line no-new-func
    const run = new Function(`${code}; return documentModule`)()

    // The app's own host, not the one the compiled copy would reach for: this
    // has to land in the real store so the URLs can be read back.
    const moved = await run.localise(doc, {
      saveImage: (mime, bytes) => window.api.saveImage(mime, bytes),
      fetchImage: (href) => window.api.fetchImage(href)
    })
    const refs = run.referencesOf(moved).map((r) => ({ kind: r.kind, src: r.src }))

    // The drawing's picture has to be readable where it landed, because that
    // is how Excalidraw puts a file back on the canvas.
    const wasDiagram = run
      .referencesOf(moved)
      .find((r) => r.kind === 'diagram-image')
    const loads = await new Promise((resolve) => {
      if (!wasDiagram || !wasDiagram.src.startsWith('mindflow://')) return resolve(false)
      const img = new Image()
      img.onload = () => resolve(true)
      img.onerror = () => resolve(false)
      img.src = wasDiagram.src
    })
    return { refs, inline: run.inlineBytes(moved), loads }
  },
  { code: module }
)

console.log('\nafter localise:')
for (const ref of after.refs) console.log(`${ref.kind.padEnd(15)} ${ref.src.slice(0, 52)}`)
console.log(`\ninlineBytes after: ${after.inline} (expect 0 - the drawing's picture has moved out)`)
console.log(`and Excalidraw can still load it where it landed: ${after.loads}`)
// The bookmark's images point at a host that does not exist here, so they stay
// put - which is the behaviour: anything that cannot be moved is left alone.
const icon = after.refs.find((r) => r.kind === 'bookmark-icon')
console.log(`the card's inline icon moved too: ${icon?.src.startsWith('mindflow://')}`)
console.log(`the unreachable one was left alone: ${
  after.refs.find((r) => r.kind === 'bookmark-image')?.src.startsWith('https://')
}`)
console.log(`RESULT nothing is left inside the document: ${after.inline === 0 && after.loads}`)

await app.close()
process.exit(0)
