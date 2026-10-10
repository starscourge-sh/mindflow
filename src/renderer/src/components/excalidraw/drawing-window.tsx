import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'

import type { DiagramScene } from '@/extensions/excalidraw'
import { useAppearance } from '@/lib/vigil'

const ExcalidrawCanvas = lazy(() => import('@/components/excalidraw/excalidraw-canvas'))

/** The same pause the block uses, so the two behave alike. */
const DEBOUNCE_MS = 400

/**
 * A drawing on its own, filling a window of its own.
 *
 * The whole page, rather than a block in a note: this renders instead of the
 * app when the window was opened with `?drawing=<id>`. What is drawn here is
 * sent back to the note that opened it, which is the only copy that is kept -
 * this window holds nothing when it closes.
 */
export function DrawingWindow({ id }: { id: string }): React.JSX.Element {
  // Sounds and Motion as you set them, in this window too.
  useAppearance()
  const [scene, setScene] = useState<DiagramScene | null>(null)
  // Until the note has answered there is nothing to draw, and mounting the
  // canvas empty would send that emptiness straight back as an edit.
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void window.api.drawingScene(id).then((given) => {
      setScene((given as DiagramScene | null) ?? null)
      setReady(true)
    })
  }, [id])

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onChange = useCallback(
    (next: DiagramScene) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => window.api.saveDrawing(id, next), DEBOUNCE_MS)
    },
    [id]
  )

  // Closing the window mid-stroke still keeps the stroke.
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <>
      <div className="drawing-bar" />
      <div className="drawing-window">
        {ready && (
          <Suspense fallback={null}>
            <ExcalidrawCanvas scene={scene} onChange={onChange} />
          </Suspense>
        )}
      </div>
    </>
  )
}
