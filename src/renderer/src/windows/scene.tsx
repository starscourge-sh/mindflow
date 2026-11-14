// The welcome's arrival over the whole screen: scene.html (main: makeScene).
import '../assets/main.css'
import { useEffect, useRef, useState } from 'react'
import { CornerDownLeft, Volume2, VolumeX } from 'lucide-react'
import { start } from '../main'
import { clearRoom } from '../lib/clear-room'
import { SCENE, WelcomeScene, type ScenePlace } from '../components/haligtree/welcome-scene'

export type SceneStart = { t0: number; place: ScenePlace; name: string; sounds: boolean }

/** Small and quiet in the screen's corners, as Dia's are: on their own ground, so they read on fog and storm alike. */
const CORNER_BUTTON = 'pointer-events-auto flex h-8 items-center gap-1.5 rounded-full bg-white/80 px-3 text-[0.8125rem] font-medium text-[#24211d] shadow-[0_1px_2px_rgba(0,0,0,0.12),0_4px_14px_rgba(0,0,0,0.10)] ring-1 ring-black/5 transition-[background-color,transform] hover:bg-white active:scale-[0.97]'

/**
 * The scene over the whole screen until it has drawn in to the welcome's window (the handover); then only its two
 * controls stay, in the screen's corners, until the first words, the rest of the window letting clicks through
 * (lib/clear-room.ts). Esc, Enter, Space or a click before the handover go straight to the end of the arrival.
 */
function SceneWindow(): React.JSX.Element | null {
  const [now, setNow] = useState<SceneStart | null>(null)
  const [loud, setLoud] = useState(true)
  const [handed, setHanded] = useState(false)
  const [controls, setControls] = useState<'off' | 'in' | 'out'>('off')
  const skipped = useRef(false)
  const skip = (): void => {
    if (skipped.current) return
    skipped.current = true
    window.api.sceneSkip()
  }
  useEffect(() => {
    const off = window.api.onScene((start) => {
      setNow(start)
      setLoud(start.sounds)
    })
    // Drawn once, and empty: main shows the window and starts the clock from here.
    requestAnimationFrame(() => requestAnimationFrame(() => window.api.sceneReady()))
    return off
  }, [])
  useEffect(() => {
    if (!now) return
    const at = (ms: number, then: () => void): ReturnType<typeof setTimeout> => setTimeout(then, Math.max(0, now.t0 + ms - Date.now()))
    const timers = [
      at(1200, () => setControls('in')),
      at(SCENE.sweepFrom, () => setControls('out'))
    ]
    return () => timers.forEach(clearTimeout)
  }, [now])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!now) return null
  return (
    <div data-clear={handed ? '' : undefined} className="fixed inset-0 select-none" onPointerDown={(event) => void (!handed && !(event.target as HTMLElement).closest('button') && skip())}>
      {!handed && <WelcomeScene t0={now.t0} place={now.place} mode="desk" name={now.name} onHandover={() => (setHanded(true), window.api.sceneDone())} />}
      <div data-clear="" className={`pointer-events-none fixed inset-x-0 bottom-0 flex items-end justify-between p-4 transition-opacity ${controls === 'in' ? 'opacity-100 duration-700' : 'opacity-0 duration-500'}`}>
        <button type="button" data-scene-sound="" aria-pressed={loud} aria-label={loud ? 'Sound on' : 'Sound off'} title={loud ? 'Sound on' : 'Sound off'} onClick={() => {
          const next = !loud
          setLoud(next)
          window.api.sceneSound(next)
        }} className={`${CORNER_BUTTON} w-8 justify-center px-0`}>
          {loud ? <Volume2 className="size-4" strokeWidth={1.8} /> : <VolumeX className="size-4" strokeWidth={1.8} />}
        </button>
        <button type="button" data-scene-skip="" onClick={skip} className={CORNER_BUTTON}>
          Skip intro <CornerDownLeft className="size-3.5 opacity-60" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}

// Never dimmed when another window has the focus (main.css, data-floating): the welcome's window takes it at the handover.
document.documentElement.dataset.floating = ''
start(<SceneWindow />)
// Past the handover only the corner controls take a click; the rest of the screen is the desktop's and the welcome's.
clearRoom()
