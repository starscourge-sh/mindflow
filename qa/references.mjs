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

const built = await page.evaluate((png) => {
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
          image: 'https://example.com/card.png',
          icon: 'https://example.com/favicon.ico'
        }
      },
      { type: 'paragraph', content: [{ type: 'noteLink', attrs: { id: 'note-42', label: 'Another note' } }] }
    ]
  }
  editor.commands.setContent(doc)
  return true
}, PNG)

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

await app.close()
process.exit(0)
