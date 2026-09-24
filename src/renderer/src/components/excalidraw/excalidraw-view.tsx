import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react'
import { Check, PencilRuler } from 'lucide-react'

import type { DiagramScene } from '@/extensions/excalidraw'
import type { ExcalidrawElement, NonDeleted } from '@excalidraw/excalidraw/element/types'

const ExcalidrawCanvas = lazy(() => import('@/components/excalidraw/excalidraw-canvas'))

/**
 * Long enough that a stroke is one write, short enough to feel saved - and
 * under the 500ms the history plugin groups undo steps by. At 600 every save
 * opened its own undo step, so Ctrl-Z walked back through a drawing one
 * autosave at a time instead of stepping out of it. Now a run of drawing is
 * one step and a pause starts the next, which is how typing already behaves.
 */
const DEBOUNCE_MS = 400

/** Below this there is no room left to draw in. */
const MIN_HEIGHT = 120

/**
 * A drawing in the flow of the note: a picture of it while you read, the real
 * canvas while you draw.
 *
 * The picture is an SVG rather than a second canvas, so ten diagrams in a note
 * cost ten images and not ten editors.
 */
export function ExcalidrawView(props: NodeViewProps): React.JSX.Element {
  const scene = props.node.attrs.scene as DiagramScene | null
  // A drawing inserted from `/` has nothing in it yet, so it opens ready to
  // draw in. One that was saved opens as what it is.
  const [editing, setEditing] = useState(!scene)
  const [preview, setPreview] = useState<string | null>(null)

  // Through a ref: the save below is deliberately stable, so it can also run
  // when the block goes away, and the props it closes over would be stale.
  const update = useRef(props.updateAttributes)
  useEffect(() => {
    update.current = props.updateAttributes
  })

  const held = useRef<DiagramScene | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const save = useCallback(() => {
    clearTimeout(timer.current)
    if (!held.current) return
    update.current({ scene: held.current })
    held.current = null
  }, [])

  const onChange = useCallback(
    (next: DiagramScene) => {
      held.current = next
      clearTimeout(timer.current)
      timer.current = setTimeout(save, DEBOUNCE_MS)
    },
    [save]
  )

  // Closing the note mid-stroke still keeps the stroke.
  useEffect(() => () => save(), [save])

  // Read off the editor state, not the `selected` prop. That prop is pushed in
  // by ProseMirror when the selection lands on or leaves the node, and on this
  // block it was arriving late and sticking on. A selector runs on every
  // transaction, so it cannot fall behind, and the same test covers a range
  // selection sweeping the block up as covers being the whole selection.
  const selected = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const pos = props.getPos()
      if (typeof pos !== 'number') return false
      const { from, to } = editor.state.selection
      return from <= pos && to >= pos + props.node.nodeSize
    }
  })

  // Held in state while the grip is down, so the frame follows the pointer
  // without a transaction per pixel. The attribute is written once, on release.
  const [dragging, setDragging] = useState<number | null>(null)
  const shown = dragging ?? (props.node.attrs.height as number)

  const resize = (event: React.PointerEvent): void => {
    event.preventDefault()
    const from = shown
    const start = event.clientY
    const at = (e: PointerEvent): number => Math.max(MIN_HEIGHT, from + e.clientY - start)
    // One signal drops both listeners, including the move handler, which
    // otherwise outlives a block deleted mid-drag.
    const done = new AbortController()

    window.addEventListener('pointermove', (e) => setDragging(at(e)), { signal: done.signal })
    window.addEventListener(
      'pointerup',
      (e) => {
        done.abort()
        props.updateAttributes({ height: at(e) })
        setDragging(null)
      },
      { signal: done.signal }
    )
  }

  useEffect(() => {
    // Nothing to draw a picture of, or the real thing is on screen already.
    const elements = scene?.elements ?? []
    if (editing || !elements.length) return undefined

    let live = true
    void (async () => {
      const { exportToSvg } = await import('@excalidraw/excalidraw')
      const svg = await exportToSvg({
        elements: elements as NonDeleted<ExcalidrawElement>[],
        files: scene?.files ?? null,
        // No background, and the same inversion the dark canvas draws under,
        // so the picture matches what was drawn.
        appState: { exportBackground: false, exportWithDarkMode: true }
      })
      // The export sizes itself in the drawing's own units. The block has a
      // height of its own, and the viewBox keeps the drawing's shape inside it.
      svg.removeAttribute('width')
      svg.removeAttribute('height')
      if (live) setPreview(svg.outerHTML)
    })()

    return () => {
      live = false
    }
  }, [editing, scene])

  return (
    <NodeViewWrapper className={`tiptap-excalidraw${selected ? ' is-selected' : ''}`}>
      <div className="tiptap-excalidraw-frame" style={{ height: shown }}>
        {editing ? (
          <div className="tiptap-excalidraw-canvas">
            <Suspense fallback={null}>
              <ExcalidrawCanvas scene={scene} onChange={onChange} />
            </Suspense>
          </div>
        ) : preview ? (
          // Our own export, a few lines above, rather than anything the
          // document carried in.
          <div
            className="tiptap-excalidraw-preview"
            onDoubleClick={() => setEditing(true)}
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        ) : (
          // Empty, and also the moment before the picture of a full one is
          // ready: either way, this is the way back to the canvas.
          <button
            type="button"
            className="tiptap-excalidraw-empty"
            onClick={() => setEditing(true)}
          >
            <PencilRuler />
            <span>Drawing</span>
          </button>
        )}

        {editing && (
          <button
            type="button"
            className="tiptap-excalidraw-done"
            aria-label="Finish drawing"
            onClick={() => {
              save()
              setEditing(false)
            }}
          >
            <Check />
          </button>
        )}
      </div>

      {/* Notion's bottom grip, and only that one: the width belongs to the
          column, so there is nothing to drag sideways. */}
      <div className="tiptap-excalidraw-grip" onPointerDown={resize} />
    </NodeViewWrapper>
  )
}
