import { useEffect, useState } from 'react'
import { Viewer, type Picture } from '@/components/image/image-look'
import { useAppearance } from '@/lib/vigil'
import '@/assets/styles/_variables.scss'
import '@/components/mindflow/mindflow-editor.scss'

/**
 * A sticky's pictures in Vigil's own Quick Look: a see-through window over the
 * sticky's screen that holds only the viewer. The picture grows out of its
 * place in the sticky and goes back into it; then the window is gone.
 */
export function LookWindow(): React.JSX.Element | null {
  // Motion, Blurring and the sounds as Settings say, as in any window.
  useAppearance()
  const [shown, setShown] = useState<{ pictures: Picture[]; at: number } | null>(null)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    void window.api.lookWhat().then((what) => {
      if (!what) return window.api.lookDone()
      const pictures = what.pictures.map(({ rect, ...one }) => ({ ...one, el: null, rect: rect && new DOMRect(rect.x, rect.y, rect.width, rect.height) }))
      setShown({ pictures, at: Math.min(Math.max(0, what.at), pictures.length - 1) })
    })
  }, [])

  // Left for another app or screen: put away at once, the way a click outside does.
  useEffect(() => {
    const away = (): void => window.api.lookDone()
    window.addEventListener('blur', away)
    return () => window.removeEventListener('blur', away)
  }, [])

  return shown && <Viewer pictures={shown.pictures} start={shown.at} onClose={() => window.api.lookDone()} />
}
