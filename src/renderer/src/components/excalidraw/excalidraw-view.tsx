import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NodeViewWrapper, useEditorState, type NodeViewProps } from '@tiptap/react'
import { Check, ExternalLink, Maximize2, Minimize2, PencilRuler } from 'lucide-react'

import type { DiagramScene } from '@/extensions/excalidraw'
import { host } from '@/lib/host'
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
  // The block is as wide as the column and as tall as its grip allows, which
  // is a thumbnail's worth of room for anything with more than four boxes in
  // it. This lifts the same canvas out of the flow to fill the window.
  const [full, setFull] = useState(false)
  // Open in a window of its own. The drawing lives there while it is, and this
  // block is a picture of it - double-clicking must not start a second canvas.
  const [elsewhere, setElsewhere] = useState(false)

  // Growing into full screen, and shrinking back out of it.
  //
  // The frame is a different element in each place - inline in the note, or
  // portalled to the body - so there is nothing to transition. Instead the new
  // one is measured against where the old one was and played from there: the
  // picture starts exactly where you left it and arrives where it is going.
  const box = useRef<HTMLDivElement>(null)
  const from = useRef<DOMRect | null>(null)

  const toggleFull = (): void => {
    from.current = box.current?.getBoundingClientRect() ?? null
    setFull(!full)
  }

  useLayoutEffect(() => {
    const element = box.current
    const start = from.current
    from.current = null
    if (!element || !start) return

    const end = element.getBoundingClientRect()
    const played = element.animate(
      [
        {
          transformOrigin: 'top left',
          transform:
            `translate(${start.left - end.left}px, ${start.top - end.top}px) ` +
            `scale(${start.width / end.width}, ${start.height / end.height})`
        },
        { transformOrigin: 'top left', transform: 'none' }
      ],
      { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
    )

    // Excalidraw sizes its canvas from the box it is in, and a scaled box
    // measures as the size it is being drawn at rather than the size it will
    // settle at - so it read the old width mid-flight and kept it, leaving the
    // grid stopping short of the frame. This asks once the transform is gone.
    void played.finished.then(() => window.dispatchEvent(new Event('resize')))
  }, [full])

  /**
   * A window of its own, and whatever comes back from it.
   *
   * The id is minted on first use rather than when the block is made, so a
   * document written before any of this still works - and a drawing pasted
   * into another note, which arrives carrying an id, is told apart from this
   * one the moment either is opened.
   */
  const openInWindow = (): void => {
    const id = (props.node.attrs.id as string | null) ?? crypto.randomUUID()
    if (!props.node.attrs.id) props.updateAttributes({ id })

    // Hand the drawing over rather than keeping a second live copy of it. The
    // pending stroke is written down first, so what the window opens on is
    // what is on screen here; then this one steps back to being a picture,
    // which is also what stops two canvases writing over each other.
    save()
    setEditing(false)
    setFull(false)
    host().openDrawing?.(id, held.current ?? scene)
  }

  // Escape leaves the drawing rather than the app. The window's own Escape
  // stands down for a dialog, which is what this is while it is up.
  useEffect(() => {
    if (!full) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') toggleFull()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  // Through a ref: the save below is deliberately stable, so it can also run
  // when the block goes away, and the props it closes over would be stale.
  const update = useRef(props.updateAttributes)
  useEffect(() => {
    update.current = props.updateAttributes
  })

  useEffect(() => {
    return host().onDrawingWindow?.((id, open) => {
      if (id === props.node.attrs.id) setElsewhere(open)
    })
  }, [props.node.attrs.id])

  useEffect(() => {
    return host().onDrawingChange?.((id, next) => {
      if (id !== props.node.attrs.id) return
      // Straight to the attributes: the window is the one being drawn in, so
      // there is nothing here to debounce or to argue with.
      update.current({ scene: next as DiagramScene })
    })
  }, [props.node.attrs.id])

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

  const frame = (
    <div
      ref={box}
      className={`tiptap-excalidraw-frame${full ? ' is-full' : ''}`}
      // Filling the window is not a height the grip set, so it is not one to
      // remember either: the block keeps the height it had underneath.
      style={full ? undefined : { height: shown }}
      role={full ? 'dialog' : undefined}
    >
        {editing ? (
          <div className="tiptap-excalidraw-canvas">
            <Suspense fallback={null}>
              <ExcalidrawCanvas scene={scene} onChange={onChange} />
            </Suspense>
          </div>
        ) : preview ? (
          <>
            {/* Our own export, a few lines above, rather than anything the
                document carried in. */}
            <div
              className="tiptap-excalidraw-preview"
              onDoubleClick={() => !elsewhere && setEditing(true)}
              dangerouslySetInnerHTML={{ __html: preview }}
            />
            {/* A finished drawing looks like a picture, and nothing about a
                picture says it can be opened. This is the only place that
                says so, and it says it on hover rather than all the time -
                a note full of drawings should read as a note. */}
            <div className="tiptap-excalidraw-hint">
              {elsewhere ? 'Open in its own window' : 'Double-click to edit'}
            </div>
          </>
        ) : (
          // Empty, and also the moment before the picture of a full one is
          // ready: either way, this is the way back to the canvas.
          <button
            type="button"
            className="tiptap-excalidraw-empty"
            onClick={() => !elsewhere && setEditing(true)}
          >
            <PencilRuler />
            <span>Drawing</span>
          </button>
        )}

        {/* One island, the shape Excalidraw uses for its own floating tools,
            on the wall opposite them so the two never overlap. */}
        <div className="tiptap-excalidraw-tools">
          <button
            type="button"
            aria-label={full ? 'Leave full screen' : 'Open in full screen'}
            onClick={toggleFull}
          >
            {full ? <Minimize2 /> : <Maximize2 />}
          </button>

          {host().openDrawing && (
            <button
              type="button"
              aria-label={elsewhere ? 'Bring its window forward' : 'Open in its own window'}
              onClick={openInWindow}
            >
              <ExternalLink />
            </button>
          )}

          {editing && (
            <button
              type="button"
              className="is-done"
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
    </div>
  )

  return (
    <NodeViewWrapper className={`tiptap-excalidraw${selected ? ' is-selected' : ''}`}>
      {/* Portalled while full: inside the editor it would be clipped by the
          overflow that makes the document scroll, and sized by the column. */}
      {full ? createPortal(frame, document.body) : frame}

      {/* Notion's bottom grip, and only that one: the width belongs to the
          column, so there is nothing to drag sideways. */}
      <div className="tiptap-excalidraw-grip" onPointerDown={resize} />
    </NodeViewWrapper>
  )
}
