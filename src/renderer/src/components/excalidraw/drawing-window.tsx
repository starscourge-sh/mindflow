import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'

import type { DiagramScene } from '@/extensions/excalidraw'
import { useAppearance } from '@/lib/vigil'
import { TooltipProvider } from '@/components/ui/tooltip'

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
  // The latest stroke not yet sent, so closing can send it rather than drop it.
  const pending = useRef<DiagramScene | null>(null)
  const onChange = useCallback(
    (next: DiagramScene) => {
      clearTimeout(timer.current)
      pending.current = next
      timer.current = setTimeout(() => {
        pending.current = null
        window.api.saveDrawing(id, next)
      }, DEBOUNCE_MS)
    },
    [id]
  )

  // Closing the window mid-stroke still keeps the stroke: what is waiting is
  // sent at once, as the window goes (pagehide) or the view does.
  useEffect(() => {
    const flush = (): void => {
      clearTimeout(timer.current)
      if (pending.current) window.api.saveDrawing(id, pending.current)
      pending.current = null
    }
    window.addEventListener('pagehide', flush)
    return () => (window.removeEventListener('pagehide', flush), flush())
  }, [id])

  // Which note it came from, so a second drawing window is told apart from the first.
  const note = new URLSearchParams(location.search).get('in')

  return (
    <TooltipProvider delayDuration={600}>
      <div className="drawing-window">
        {ready && (
          <Suspense fallback={null}>
            <ExcalidrawCanvas
              header
              scene={scene}
              onChange={onChange}
              start={
                <span className="flex min-w-0 shrink items-baseline gap-1.5">
                  <h1 className="shrink-0 font-medium">Drawing</h1>
                  {note && <span className="truncate text-muted-foreground">in {note}</span>}
                </span>
              }
            />
          </Suspense>
        )}
      </div>
    </TooltipProvider>
  )
}
