import { useEffect, useState } from 'react'
import { click, type ClickName } from '@/lib/sound'
import { currentStyle, setStyle, type Style } from '@/lib/theme'

/** Each style's option: its name, and the sound it makes when chosen. */
const OPTIONS: { style: Style; label: string; sound: ClickName }[] = [
  { style: 'soft', label: 'Soft', sound: 'tick' },
  { style: 'brutal', label: 'Brutal', sound: 'slam' },
  { style: 'paper', label: 'Paper', sound: 'leaf' },
  { style: 'swiss', label: 'Swiss', sound: 'snap' }
]

/**
 * Soft, Brutal, Paper or Swiss: how things are drawn, in whatever theme is worn.
 *
 * Each option is drawn in its own style whichever is on, so the choice shows
 * itself: Soft a rounded chip, Brutal a sticker stuck on askew, outlined in
 * the ink and standing on a hard shadow (brutal.css), Paper a serif label on
 * a ruled line, Swiss a flat block in a heavy sans. Pointed at, nothing makes
 * a sound: a click heard on hover would sound like it had been chosen.
 * Chosen, each has its own: a tick, a slam, a page turned, a snap.
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
    click(OPTIONS.find((one) => one.style === next)!.sound)
    setStyle(next)
    set(next)
  }
  return (
    <div role="radiogroup" aria-label="Style" className={`mf-style-pick ${className}`}>
      {OPTIONS.map((one) => (
        <button key={one.style} type="button" role="radio" aria-checked={style === one.style} data-keep-soft={one.style === 'soft' ? '' : undefined} className={`mf-style-${one.style}`} onClick={() => pick(one.style)}>
          {one.label}
        </button>
      ))}
    </div>
  )
}
