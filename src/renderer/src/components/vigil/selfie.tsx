import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'

import { chime } from '@/lib/sound'
import { Kbd } from './ui'

/**
 * A selfie for a session's log, taken in the pill: the camera's picture,
 * mirrored the way Photo Booth shows you, a count of 3, 2, 1 so there is time
 * to look up from the mouse, then the picture held still to keep or take
 * again. Kept as it was seen (mirrored), a small JPEG, stored like any
 * picture. The camera is on only while this shows.
 */
type Stage = 'asking' | 'live' | 'counting' | 'shot' | 'denied' | 'none'

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

export function Selfie({ onKeep, onClose, primary, plain }: {
  /** The picture kept, stored: its address. */
  onKeep: (url: string) => void
  onClose: () => void
  primary: string
  plain: string
}): React.JSX.Element {
  const [stage, setStage] = useState<Stage>('asking')
  const [count, setCount] = useState(3)
  const [shot, setShot] = useState<Blob | null>(null)
  const [shotUrl, setShotUrl] = useState('')
  const [flash, setFlash] = useState(0)
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [tries, setTries] = useState(0)

  const stop = (): void => {
    for (const track of stream.current?.getTracks() ?? []) track.stop()
    stream.current = null
  }

  // The camera: asked for (once, the way macOS asks), then turned on.
  useEffect(() => {
    let gone = false
    setStage('asking')
    void (async () => {
      if ((await window.api.cameraAccess()) !== 'granted') return void (!gone && setStage('denied'))
      try {
        const live = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false })
        if (gone) return void live.getTracks().forEach((track) => track.stop())
        stream.current = live
        if (video.current) (video.current.srcObject = live, void video.current.play().catch(() => undefined))
        setStage('live')
      } catch (error) {
        if (gone) return
        setStage(error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') ? 'none' : 'denied')
      }
    })()
    return () => {
      gone = true
      stop()
    }
  }, [tries])
  useEffect(() => () => void (shotUrl && URL.revokeObjectURL(shotUrl)), [shotUrl])

  // 3, 2, 1, each with a tick; then the picture.
  useEffect(() => {
    if (stage !== 'counting') return
    if (count === 0) return void take()
    const next = setTimeout(() => setCount(count - 1), 1000)
    if (count < 3) chime('tick')
    return () => clearTimeout(next)
  }, [stage, count]) // eslint-disable-line react-hooks/exhaustive-deps

  const begin = (): void => {
    chime('tick')
    setCount(3)
    setStage('counting')
  }
  // What the preview shows, 4:3 from the middle, flipped as seen.
  const take = (): void => {
    const from = video.current
    if (!from || !from.videoWidth) return setStage('live')
    const [w, h] = [from.videoWidth, from.videoHeight]
    const side = Math.min(w, (h * 4) / 3)
    const tall = (side * 3) / 4
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const pen = canvas.getContext('2d')!
    pen.translate(canvas.width, 0)
    pen.scale(-1, 1)
    pen.drawImage(from, (w - side) / 2, (h - tall) / 2, side, tall, 0, 0, canvas.width, canvas.height)
    chime('shutter')
    setFlash((n) => n + 1)
    canvas.toBlob((blob) => {
      if (!blob) return setStage('live')
      setShot(blob)
      setShotUrl(URL.createObjectURL(blob))
      setStage('shot')
    }, 'image/jpeg', 0.82)
  }
  const retake = (): void => {
    chime('tap')
    setShot(null)
    setStage('live')
  }
  const keep = async (): Promise<void> => {
    if (!shot) return
    const url = await window.api.saveImage('image/jpeg', new Uint8Array(await shot.arrayBuffer()))
    if (!url) return chime('nope')
    stop()
    onKeep(url)
  }
  const close = (): void => {
    chime('fold')
    stop()
    onClose()
  }

  // Enter takes it, then keeps it; Esc steps back (a count called off, a picture taken again) or closes.
  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined)
  keys.current = (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (stage === 'live') begin()
      else if (stage === 'counting') setCount(0)
      else if (stage === 'shot') void keep()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (stage === 'counting') (chime('fold'), setStage('live'))
      else if (stage === 'shot') retake()
      else close()
    }
  }
  useEffect(() => {
    const listen = (event: KeyboardEvent): void => keys.current(event)
    window.addEventListener('keydown', listen, true)
    return () => window.removeEventListener('keydown', listen, true)
  }, [])

  const calm = still()
  const blocked = stage === 'denied' || stage === 'none'
  return (
    <motion.div data-selfie={stage} className="mt-2" initial={calm ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
      {blocked ? (
        <div role="status" className="relative rounded-[10px] border px-3 py-2.5">
          <button type="button" aria-label="Not now" title="Not now  (Esc)" onClick={close} className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <X className="size-3.5" />
          </button>
          <p className="pr-6 text-[13px] font-semibold leading-5 text-foreground">{stage === 'none' ? 'No camera found' : 'Vigil can’t use the camera yet'}</p>
          <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
            {stage === 'none' ? 'Plug one in, or paste or drop a picture instead.' : 'Turn Vigil on under Camera in Privacy settings, then try again.'}
          </p>
          <div className="mt-2 flex items-center gap-1">
            {stage === 'denied' && <button type="button" data-selfie-privacy onClick={() => window.api.privacySettings('camera')} className={primary}>Open Privacy settings</button>}
            <button type="button" onClick={() => (chime('tap'), setTries((n) => n + 1))} className={plain}>Try again</button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[10px] border bg-[color-mix(in_oklab,var(--foreground)_6%,var(--background))]">
            {/* Mirrored, as a selfie camera shows you. */}
            <video ref={video} muted playsInline aria-label="Camera preview" className={`absolute inset-0 size-full -scale-x-100 object-cover ${stage === 'shot' ? 'invisible' : ''}`} />
            {stage === 'shot' && shotUrl && <img data-selfie-shot src={shotUrl} alt="Your selfie" className="absolute inset-0 size-full object-cover" />}
            {stage === 'asking' && <span className="absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">Turning the camera on…</span>}
            {stage === 'counting' && count > 0 && (
              <motion.span
                key={count}
                aria-live="polite"
                className="absolute inset-0 flex items-center justify-center text-[56px] font-semibold text-white tabular-nums [text-shadow:0_1px_12px_rgb(0_0_0/0.45)]"
                initial={calm ? false : { opacity: 0, scale: 1.15 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                {count}
              </motion.span>
            )}
            {/* The shutter: the picture dims for a blink and comes back. No flash of white. */}
            {flash > 0 && !calm && (
              <motion.span key={flash} aria-hidden className="pointer-events-none absolute inset-0 bg-black" initial={{ opacity: 0.35 }} animate={{ opacity: 0 }} transition={{ duration: 0.3 }} />
            )}
          </div>
          <div className="mt-2 flex items-center gap-1">
            {stage === 'shot' ? (
              <>
                <button type="button" data-selfie-keep onClick={() => void keep()} className={primary}>Keep <Kbd className="ml-1.5 border-white/30 bg-transparent text-current">↵</Kbd></button>
                <button type="button" data-selfie-retake onClick={retake} className={plain}>Retake</button>
              </>
            ) : (
              <button type="button" data-selfie-take disabled={stage === 'asking'} onClick={() => (stage === 'counting' ? setCount(0) : begin())} className={`${primary} disabled:opacity-50`}>
                {stage === 'counting' ? 'Take it now' : 'Take a selfie'} <Kbd className="ml-1.5 border-white/30 bg-transparent text-current">↵</Kbd>
              </button>
            )}
            <button type="button" data-selfie-cancel onClick={close} className={`${plain} ml-auto`}>Cancel</button>
          </div>
        </>
      )}
    </motion.div>
  )
}
