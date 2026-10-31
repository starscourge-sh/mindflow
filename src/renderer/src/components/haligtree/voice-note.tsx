import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Mic, Square } from 'lucide-react'

import { saveAttachment } from '@/extensions/image-drop'
import { refuse } from '@/components/haligtree/ui'
import { chime } from '@/lib/sound'

/** The kinds a recording can be kept as, the first the recorder makes: `.m4a` plays anywhere, `.weba` is Chromium's own. */
const KINDS = [
  { type: 'audio/mp4', extension: 'm4a' },
  { type: 'audio/webm;codecs=opus', extension: 'weba' },
  { type: 'audio/webm', extension: 'weba' }
]

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

/**
 * Record a voice note: the microphone asked for (macOS once), then a card at
 * the bottom of the window with the sound's level as it comes in, the time,
 * and Stop. Esc or “Cancel” throws it away. Resolves with the recording as a
 * file, or null when cancelled or the microphone is not allowed.
 */
export async function recordVoice(): Promise<File | null> {
  if (!(await window.api.haligtree<boolean>('mic:ask'))) {
    refuse('Haligtree may not use the microphone. Allow it in System Settings, under Privacy & Security, then Microphone')
    return null
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch {
    refuse('No microphone could be used. Check one is connected and allowed')
    return null
  }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  return new Promise((resolve) => {
    const finish = (file: File | null): void => {
      stream.getTracks().forEach((track) => track.stop())
      root.unmount()
      host.remove()
      resolve(file)
    }
    root.render(<Recorder stream={stream} onDone={finish} />)
  })
}

/** Record, then keep it where the caret is in this editor. */
export async function recordInto(editor: { chain: () => { focus: () => { setAttachment: (attrs: { src: string; name: string; size: number }) => { run: () => boolean } } } }): Promise<void> {
  const file = await recordVoice()
  if (!file) return
  try {
    editor.chain().focus().setAttachment(await saveAttachment(file)).run()
    chime('saved')
  } catch {
    refuse('The recording could not be kept. Try again')
  }
}

/** Record, then keep it as a new capture of its own, which opens. */
export async function recordAsCapture(open: (id: string) => void): Promise<void> {
  const file = await recordVoice()
  if (!file) return
  try {
    const attrs = await saveAttachment(file)
    const id = await window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'attachment', attrs }, { type: 'paragraph' }] } })
    if (!id) return refuse('The recording could not be kept. Try again')
    chime('saved')
    open(id)
  } catch {
    refuse('The recording could not be kept. Try again')
  }
}

function Recorder({ stream, onDone }: { stream: MediaStream; onDone: (file: File | null) => void }): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const [seconds, setSeconds] = useState(0)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    const kind = KINDS.find((one) => MediaRecorder.isTypeSupported(one.type)) ?? KINDS[2]
    const parts: Blob[] = []
    const record = new MediaRecorder(stream, { mimeType: kind.type })
    let keep = false
    record.ondataavailable = (event) => event.data.size && parts.push(event.data)
    record.onstop = () => {
      if (!keep || !parts.length) return done.current(null)
      const at = new Date()
      const name = `Voice note ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${at.getHours()}.${String(at.getMinutes()).padStart(2, '0')}.${kind.extension}`
      done.current(new File(parts, name, { type: kind.type.split(';')[0] }))
    }
    recorder.current = Object.assign(record, { keep: (yes: boolean) => (keep = yes) })
    record.start(250)
    chime('windup')
    const started = performance.now()

    // The level as it comes in: bars along the card, newest on the right, in the text colour.
    const ears = new AudioContext()
    const analyser = ears.createAnalyser()
    analyser.fftSize = 256
    ears.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    const levels: number[] = []
    let frame = 0
    const draw = (): void => {
      frame = requestAnimationFrame(draw)
      setSeconds(Math.floor((performance.now() - started) / 1000))
      const el = canvas.current
      if (!el) return
      analyser.getByteTimeDomainData(samples)
      let peak = 0
      for (const one of samples) peak = Math.max(peak, Math.abs(one - 128) / 128)
      levels.push(peak)
      const ratio = devicePixelRatio
      const width = el.clientWidth * ratio, height = el.clientHeight * ratio
      if (el.width !== width) (el.width = width, el.height = height)
      const c = el.getContext('2d')!
      c.clearRect(0, 0, width, height)
      c.fillStyle = getComputedStyle(el).color
      const bar = 3 * ratio, gap = 2 * ratio
      const count = Math.floor(width / (bar + gap))
      const shown = levels.slice(-count)
      shown.forEach((level, index) => {
        const tall = Math.max(2 * ratio, Math.min(1, level * 2.5) * height)
        c.beginPath()
        c.roundRect(width - (shown.length - index) * (bar + gap), (height - tall) / 2, bar, tall, bar / 2)
        c.fill()
      })
    }
    draw()
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey, true)
      void ears.close()
      // Gone without a choice (a dev double mount): stopped quietly, not taken as Cancel.
      record.onstop = null
      if (record.state !== 'inactive') record.stop()
    }
  }, [stream])

  const stop = (keep: boolean): void => {
    const record = recorder.current as (MediaRecorder & { keep: (yes: boolean) => void }) | null
    if (!record || record.state === 'inactive') return
    record.keep(keep)
    record.stop()
  }
  const cancel = (): void => (chime('away'), stop(false))

  return (
    <div role="dialog" aria-label="Recording a voice note" data-voice-recorder
      className="fixed bottom-28 left-1/2 z-[1000] flex w-[420px] max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-popover py-2.5 pr-2.5 pl-4 text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2 duration-200">
      <span className="relative flex size-2.5 shrink-0" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ background: 'var(--tt-color-text-red)' }} />
        <span className="relative inline-flex size-2.5 rounded-full" style={{ background: 'var(--tt-color-text-red)' }} />
      </span>
      <canvas ref={canvas} data-voice-level className="h-7 min-w-0 flex-1 text-foreground/70" />
      <span data-voice-time className="w-10 shrink-0 text-right text-control tabular-nums text-foreground">{clock(seconds)}</span>
      <button type="button" onClick={cancel} className="shrink-0 cursor-pointer rounded-lg px-2 py-1.5 text-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]">
        Cancel <kbd className="ml-1 rounded border border-border px-1 text-[11px]">Esc</kbd>
      </button>
      <button type="button" aria-label="Stop and keep" onClick={() => stop(true)}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-foreground px-2.5 py-1.5 text-control text-background transition-transform active:scale-[0.97]">
        <Square className="size-3 fill-current" /> Stop
      </button>
    </div>
  )
}

/** The microphone, for a button that starts a recording. */
export const MicIcon = Mic
