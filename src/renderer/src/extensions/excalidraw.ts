import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

import { ExcalidrawView } from '@/components/excalidraw/excalidraw-view'

import type { BinaryFiles } from '@excalidraw/excalidraw/types'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'

/** What a drawing is: its shapes, and the images pasted into it. */
export interface DiagramScene {
  elements: ExcalidrawElement[]
  /** Keyed by the id the elements point at. Empty unless a picture was pasted. */
  files: BinaryFiles
}

function readScene(value: string | null): DiagramScene | null {
  if (!value) return null
  try {
    return JSON.parse(value) as DiagramScene
  } catch {
    return null
  }
}

/**
 * A drawing the note holds, rather than a file it links to.
 *
 * The scene rides on the node, so a diagram travels with the note: copy the
 * block and you copy the drawing, and nothing has to be kept in step on disk.
 * That is the whole point of it being a block instead of a linked canvas.
 */
export const ExcalidrawDiagram = Node.create({
  name: 'excalidraw',
  group: 'block',
  atom: true,
  // Deliberately not `draggable`: that flag puts `draggable="true"` on the
  // block's DOM, which makes every pixel of the canvas a drag source, so a
  // stroke becomes the browser dragging the block. The grip in the gutter
  // carries its own, and moves the block without this.

  addAttributes() {
    return {
      scene: {
        default: null,
        // Written by hand, since the default renderer would put an object
        // through `String()` and store the word `[object Object]`.
        parseHTML: (element) => readScene(element.getAttribute('data-scene')),
        renderHTML: ({ scene }) => (scene ? { 'data-scene': JSON.stringify(scene) } : {})
      },
      // Height only. The width is the column's, the way every other block here
      // works, so a drawing never sits at an odd width against the text.
      height: {
        default: 200,
        parseHTML: (element) => Number(element.getAttribute('data-height')) || undefined,
        renderHTML: ({ height }) => ({ 'data-height': String(height) })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-excalidraw]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // The clipboard and export shape, not the UI. The node view below is what
    // you actually see; this is what survives a copy into another note.
    return ['div', mergeAttributes(HTMLAttributes, { 'data-excalidraw': '' })]
  },

  /**
   * A marker. A canvas has no markdown, and the alternative is the scene's
   * JSON inline, which is megabytes of noise in a file meant to be read.
   * Export as JSON to keep the drawing itself; this is so a reader can see
   * that something was here rather than a silent gap.
   */
  renderMarkdown(): string {
    return '*(drawing)*'
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExcalidrawView, {
      // The canvas owns its pointer and key events: without this, typing a
      // label would run editor shortcuts and dragging a shape would drag the
      // block. Only events inside the canvas are taken, so clicking the frame
      // still selects the node the way every other block does.
      stopEvent: ({ event }) =>
        (event.target as HTMLElement | null)?.closest('.tiptap-excalidraw-canvas') != null
    })
  }
})
