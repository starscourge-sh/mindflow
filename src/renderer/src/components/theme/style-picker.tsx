import { useEffect, useState } from 'react'
import { click } from '@/lib/sound'
import { currentStyle, setStyle, type Style } from '@/lib/theme'

/**
 * Soft or Brutal: how things are drawn, in whatever theme is worn.
 *
 * Each option is drawn in its own style whichever is on, so the choice shows
 * itself: Soft a rounded chip, Brutal a sticker stuck on askew, outlined in
 * the ink and standing on a hard shadow (brutal.css). Pointed at, the sticker
 * settles into its shadow without a sound: a click heard on hover would sound
 * like it had been chosen. Chosen, it lands with a heavy slam.
 */
export function StylePicker({ className = '' }: { className?: string }): React.JSX.Element {
  const [style, set] = useState<Style>(currentStyle)
  useEffect(() => {
    const follow = (event: StorageEvent): void => void (event.key === 'style' && set(currentStyle()))
    window.addEventListener('storage', follow)
    return () => window.removeEventListener('storage', follow)
  }, [])
  const pick = (next: Style): void => {
    if (next === style) return
    click(next === 'brutal' ? 'slam' : 'tick')
    setStyle(next)
    set(next)
  }
  return (
    <div role="radiogroup" aria-label="Style" className={`mf-style-pick ${className}`}>
      <button type="button" role="radio" aria-checked={style === 'soft'} data-keep-soft className="mf-style-soft" onClick={() => pick('soft')}>
        Soft
      </button>
      <button type="button" role="radio" aria-checked={style === 'brutal'} className="mf-style-brutal" onClick={() => pick('brutal')}>
        Brutal
      </button>
    </div>
  )
}
