import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Mic, Square, X } from 'lucide-react'

import { saveAttachment } from '@/extensions/image-drop'
import { refuse } from '@/components/haligtree/ui'
import { chime } from '@/lib/sound'
import { FLOAT } from '@/lib/float'
import { wantsWords } from '@/lib/transcribe'

/** The kinds a recording can be kept as, the first the recorder makes: `.m4a` plays anywhere, `.weba` is Chromium's own. */
const KINDS = [
  { type: 'audio/mp4', extension: 'm4a' },
  { type: 'audio/webm;codecs=opus', extension: 'weba' },
  { type: 'audio/webm', extension: 'weba' }
]

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

/**
 * Record a voice note: the microphone asked for (macOS once), then a pill at
 * the bottom of the window with the sound's level as it comes in, the time,
 * and a red Stop. Esc or × throws it away. Resolves with the recording as a
 * file and its length in seconds (the file itself does not say: a recorder
 * writes no length into it), or null when cancelled or the microphone is not
 * allowed.
 */
export async function recordVoice(): Promise<Recording | null> {
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
    const finish = (kept: Recording | null): void => {
      stream.getTracks().forEach((track) => track.stop())
      root.unmount()
      host.remove()
      resolve(kept)
    }
    root.render(<Recorder stream={stream} onDone={finish} />)
  })
}

/** Record, then keep it where the caret is in this editor. */
export async function recordInto(editor: { chain: () => { focus: () => { setAttachment: (attrs: { src: string; name: string; size: number; transcribe?: boolean; duration?: number }) => { run: () => boolean } } } }): Promise<void> {
  const kept = await recordVoice()
  if (!kept) return
  try {
    editor.chain().focus().setAttachment({ ...(await saveAttachment(kept.file)), duration: kept.seconds, transcribe: await wantsWords() }).run()
    chime('saved')
  } catch {
    refuse('The recording could not be kept. Try again')
  }
}

/** Record, then keep it as a new capture of its own, which opens. */
export async function recordAsCapture(open: (id: string) => void): Promise<void> {
  const kept = await recordVoice()
  if (!kept) return
  try {
    const attrs = { ...(await saveAttachment(kept.file)), duration: kept.seconds, transcribe: await wantsWords() }
    const id = await window.api.captures.create({ kind: 'note', body: { type: 'doc', content: [{ type: 'attachment', attrs }, { type: 'paragraph' }] } })
    if (!id) return refuse('The recording could not be kept. Try again')
    chime('saved')
    open(id)
  } catch {
    refuse('The recording could not be kept. Try again')
  }
}

/** A kept recording, with the length its player shows from the start. */
export interface Recording {
  file: File
  seconds: number
}

function Recorder({ stream, onDone }: { stream: MediaStream; onDone: (kept: Recording | null) => void }): React.JSX.Element {
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
      // Timed from the recorder's own start and stop, to the hundredth.
      const seconds = Math.round((performance.now() - begun) / 10) / 100
      done.current({ file: new File(parts, name, { type: kind.type.split(';')[0] }), seconds })
    }
    let begun = performance.now()
    record.onstart = () => (begun = performance.now())
    recorder.current = Object.assign(record, { keep: (yes: boolean) => (keep = yes) })
    record.start(250)
    chime('windup')
    const started = performance.now()

    // The level as it comes in, as the Mac's dictation draws it: thin bars
    // from the middle out, tallest in the middle and tapering to the ends,
    // where the pill's mask fades them away.
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
      const bar = 2 * ratio, gap = 3 * ratio
      const half = Math.floor(width / 2 / (bar + gap))
      // The newest level in the middle, older ones moving out to both sides.
      for (let step = 0; step < half; step += 1) {
        const level = levels[levels.length - 1 - step] ?? 0
        const taper = Math.cos((step / half) * (Math.PI / 2))
        const tall = Math.max(2 * ratio, Math.min(1, level * 3) * height * (0.35 + 0.65 * taper))
        for (const side of [1, -1]) {
          c.beginPath()
          c.roundRect(width / 2 + side * step * (bar + gap) - bar / 2, (height - tall) / 2, bar, tall, bar / 2)
          c.fill()
        }
      }
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
      // The app's one floating material (lib/float.ts), as the Look Up card and the page peek wear it.
      className={`fixed bottom-28 left-1/2 z-[1000] flex w-[340px] max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-2 rounded-full py-1.5 pr-1.5 pl-2 ${FLOAT} animate-in fade-in-0 slide-in-from-bottom-2 duration-200`}>
      {/* Plain titles: the recorder has a root of its own, outside the tips' provider; the app's title tips draw them. */}
      <button type="button" aria-label="Cancel" title="Throw it away  Esc" onClick={cancel} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.95]">
        <X className="size-3.5" />
      </button>
      {/* Faded at both ends, as the level fades in from nothing. */}
      <canvas ref={canvas} data-voice-level className="h-6 min-w-0 flex-1 text-foreground/75 [mask-image:linear-gradient(90deg,transparent,#000_28%,#000_72%,transparent)]" />
      <span data-voice-time className="shrink-0 text-control tabular-nums text-muted-foreground">{clock(seconds)}</span>
      <button type="button" aria-label="Stop and keep" title="Stop and keep it" onClick={() => stop(true)}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-transform active:scale-[0.95]" style={{ background: 'var(--tt-color-text-red)' }}>
        <Square className="size-2.5 fill-current" />
      </button>
    </div>
  )
}

/** The microphone, for a button that starts a recording. */
export const MicIcon = Mic
