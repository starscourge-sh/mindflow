import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AudioLines, Bookmark, Check, ChevronDown, ChevronLeft, Mic, MicOff, Minus, Pause, Play, Square } from 'lucide-react'

// The theme's colours: this window has no editor, which is what usually brings them.
import '@/assets/styles/_variables.scss'
import { call, useAppearance } from '@/lib/haligtree'
import { chime } from '@/lib/sound'
import { cn } from '@/lib/cn'
import { Kbd } from './ui'
import { Orb } from './orb'
import { Switch } from '@/components/ui/switch'
import { clock } from './sound-player'
import type { Line, Live, SoundApp } from '../../../../main/meeting'
import { quoted } from '../../../../main/clip'

/** Room round the card for its shadow: the window is this much bigger on every side (index.ts, MEETING_ROOM). */
const ROOM = 16
const CARD = { width: 388, height: 196 }
/** Before it records: room for what is recorded, "Sound from", "My microphone" and the line about telling people. */
const READY = { width: 388, height: 256 }
/** One tab in a browser can't be told from its other tabs: a browser chosen says so. */
const BROWSERS = /^(com\.google\.Chrome|com\.apple\.Safari|org\.mozilla\.firefox|com\.microsoft\.edgemac|com\.brave\.Browser|company\.thebrowser\.|com\.operasoftware\.|com\.vivaldi\.|org\.chromium\.|app\.zen-browser|com\.kagi\.)/
export const isBrowser = (bundle: string | null): boolean => !!bundle && BROWSERS.test(bundle)
const fromName = (live: Live): string => (live.from.bundle ? live.from.name || 'One app' : 'All of this Mac')
const PILL = { width: 232, height: 44 }
/** The newest line, and how faded each before it is: the reference's bright last line over fading ones. */
const FADE = [1, 0.55, 0.32, 0.18]

/** "You", or the others' "Speaker 1, 2…" (named on the meeting's page once it is kept). */
export const speakerName = (who: string, names?: Record<string, string>): string =>
  who === 'you' ? 'You' : names?.[who] || `Speaker ${who.replace(/^s/, '')}`

const languageOf = (locale: string): string => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale.replace('_', '-')) ?? locale
  } catch {
    return locale
  }
}

const BUTTON = 'flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-control font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--tt-brand-color-500)_30%,transparent)] [-webkit-app-region:no-drag]'
const ROUND = 'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[background-color,color,scale] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--tt-brand-color-500)_30%,transparent)] [-webkit-app-region:no-drag]'

/**
 * The live card of a meeting being recorded, in a small window of its own over every app (index.ts, meetingWindow):
 * the newest line bright and the ones before it fading, who is speaking, the time, "Note this moment", pause and a
 * round stop. Moved by its body; tucked to a pill with −. Before the first recording it says what is recorded and
 * that people should be told; without the Mac's sound allowed, the one line and the way to Settings.
 */
export function MeetingCard(): React.JSX.Element {
  useAppearance()
  const [live, setLive] = useState<Live | null>(null)
  const [level, setLevel] = useState({ you: 0, others: 0 })
  const [tucked, setTucked] = useState(false)
  const [marked, setMarked] = useState(0)
  // "Sound from" open: the card's body lists where the sound can come from.
  const [choosing, setChoosing] = useState(false)
  const was = useRef<Live['state'] | null>(null)

  useEffect(() => window.api.onMeeting((next, heard) => {
    const one = next as Live
    setLive(one)
    if (heard) setLevel(heard)
    // Each turn answered once, by what it means: on air, a moment kept, the meeting kept.
    if (was.current !== one.state) {
      if (one.state === 'live' && was.current === 'starting') chime('windup')
      if (one.state === 'saving') chime('saved')
      was.current = one.state
    }
  }), [])
  useEffect(() => {
    if (!live) return
    if (live.moments.length > marked) {
      if (marked) chime('noted')
      setMarked(live.moments.length)
    }
  }, [live, marked])

  // The window is the card's size, tucked or not, its bottom middle staying where it was.
  const waiting = live?.state === 'ready' || live?.state === 'denied'
  useLayoutEffect(() => {
    const size = tucked ? PILL : waiting ? READY : CARD
    void call('meeting:size', size.width + ROOM * 2, size.height + ROOM * 2)
  }, [tucked, waiting])

  // In the card's own window: M notes the moment, Space pauses, Esc tucks it away.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (choosing && event.key !== 'Escape') return
      if (event.key === 'm' || event.key === 'M') void call('meeting:mark')
      else if (event.key === ' ') void call('meeting:pause', live?.state === 'live')
      else if (event.key === 'Escape') (choosing ? setChoosing(false) : setTucked(true))
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live?.state, choosing])

  if (!live) return <div />
  const recording = live.state === 'live' || live.state === 'paused'
  const shell = cn('mf-meeting-card relative flex flex-col overflow-hidden rounded-[18px] border bg-popover text-foreground [-webkit-app-region:drag]',
    'shadow-[0_1px_2px_color-mix(in_oklab,var(--mf-shadow-ink)_16%,transparent),0_12px_32px_-6px_color-mix(in_oklab,var(--mf-shadow-ink)_32%,transparent)]')

  if (tucked && recording) {
    return (
      <div data-clear style={{ padding: ROOM }}>
        <div data-meeting-card="pill" className={cn(shell, 'flex-row items-center gap-2 rounded-full px-2')} style={PILL}>
          <button type="button" aria-label="Show the words" onClick={() => setTucked(false)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 pl-1.5 text-left [-webkit-app-region:no-drag]">
            <OnAir paused={live.state === 'paused'} />
            <span data-meeting-time className="text-control tabular-nums">{clock(live.seconds)}</span>
            <span className="min-w-0 truncate text-meta text-muted-foreground">{speaking(live) ?? 'Recording'}</span>
          </button>
          <StopButton />
        </div>
      </div>
    )
  }

  return (
    <div data-clear style={{ padding: ROOM }}>
      <div data-meeting-card={live.state} className={shell} style={waiting ? READY : CARD}>
        {choosing ? <SoundFrom live={live} onDone={() => setChoosing(false)} />
          : recording ? <Recording live={live} level={level} onTuck={() => setTucked(true)} onChoose={() => setChoosing(true)} />
          : <Before live={live} onChoose={() => setChoosing(true)} />}
      </div>
    </div>
  )
}

/** Who is speaking now: the newest line's voice, while its words still come. */
function speaking(live: Live): string | null {
  const last = live.lines.at(-1)
  return last && !last.final && live.state === 'live' ? `${speakerName(last.speaker)} speaking` : null
}

function OnAir({ paused }: { paused: boolean }): React.JSX.Element {
  return <span aria-hidden className={cn('size-2 shrink-0 rounded-full bg-[var(--tt-color-text-red)]', paused ? 'opacity-40' : 'motion-safe:animate-pulse')} />
}

function StopButton(): React.JSX.Element {
  return (
    <button type="button" data-meeting-stop aria-label="Stop and keep the meeting" title="Stop and keep the meeting" onClick={() => void call('meeting:stop')}
      className={cn(ROUND, 'text-white')} style={{ background: 'var(--tt-color-text-red)' }}>
      <Square className="size-2.5 fill-current" />
    </button>
  )
}

function Recording({ live, level, onTuck, onChoose }: { live: Live; level: { you: number; others: number }; onTuck: () => void; onChoose: () => void }): React.JSX.Element {
  const shown = live.lines.slice(-4)
  const loud = Math.max(level.you, level.others)
  return (
    <>
      <div className="flex h-11 shrink-0 items-center gap-2 px-4 pt-1">
        <OnAir paused={live.state === 'paused'} />
        <span data-meeting-time className="text-control font-medium tabular-nums">{clock(live.seconds)}</span>
        <span className="min-w-0 flex-1 truncate text-control text-muted-foreground">{live.state === 'paused' ? 'Paused' : live.event?.title || 'Recording'} · {fromName(live)}</span>
        {/* Who is speaking, and a small level for the sound coming in, so silence on one side is seen. */}
        <span data-meeting-speaking className="flex shrink-0 items-center gap-1.5 text-meta text-muted-foreground">
          {speaking(live)}
          <span aria-hidden className="flex h-3 items-center gap-[2px]">
            {/* Grown by scale, never by height: the level moves ten times a second and must not lay the card out again. */}
            {[0.5, 1, 0.7].map((share, at) => <span key={at} className="h-3 w-[2px] origin-center rounded-full bg-current transition-transform duration-100 ease-out" style={{ transform: `scaleY(${Math.max(0.17, loud * share)})` }} />)}
          </span>
        </span>
        <button type="button" aria-label="Tuck it away" title="Tuck it away  Esc" onClick={onTuck} className={cn(ROUND, '-mr-1.5 text-muted-foreground hover:bg-accent hover:text-foreground')}>
          <Minus className="size-3.5" />
        </button>
      </div>
      {/* The words, newest at the foot and brightest; the room is fixed, so nothing below it moves as they come. */}
      <div data-meeting-lines className="flex min-h-0 flex-1 flex-col justify-end gap-1 overflow-hidden px-4 [mask-image:linear-gradient(180deg,transparent,#000_28%)]">
        {shown.length ? shown.map((line, at) => <LiveLine key={line.id} line={line} fade={FADE[shown.length - 1 - at] ?? 0.15} named={at === 0 || shown[at - 1].speaker !== line.speaker} marked={live.moments.some((one) => one.line === line.id)} />)
          : <p className="text-control text-muted-foreground">{live.words === 'none' ? 'Recording. Words are not written out live on this Mac.' : 'Recording your microphone and the sound from this Mac.'}</p>}
      </div>
      <div className="flex h-12 shrink-0 items-center gap-2 px-3">
        {/* Where the sound comes from: named in the line above, changed from here. */}
        <button type="button" data-meeting-from-button onClick={onChoose} aria-label={`Sound from ${fromName(live)}: change`} title={`Sound from ${fromName(live)} · words in ${languageOf(navigator.language)}`}
          className={cn(ROUND, 'w-auto gap-0.5 px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground')}>
          <AudioLines className="size-3.5" /><ChevronDown className="size-3" />
        </button>
        <span className="flex-1" />
        <button type="button" data-meeting-mic aria-pressed={live.from.mic} aria-label={live.from.mic ? 'Turn my microphone off' : 'Turn my microphone on'} title={live.from.mic ? 'My microphone is on' : 'My microphone is off'}
          onClick={() => void call('meeting:mic', !live.from.mic)} className={cn(ROUND, live.from.mic ? 'text-foreground hover:bg-accent' : 'text-[var(--tt-color-text-red)] hover:bg-accent')}>
          {live.from.mic ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
        </button>
        <button type="button" data-meeting-mark onClick={() => void call('meeting:mark')} disabled={live.state !== 'live'} title={live.state === 'paused' ? 'Paused: go on recording to note a moment' : undefined}
          className={cn(BUTTON, 'pr-1.5 text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50')}>
          <Bookmark className="size-3.5" />Note this moment<Kbd>M</Kbd>
        </button>
        <button type="button" data-meeting-pause aria-label={live.state === 'paused' ? 'Go on recording' : 'Pause'} title={live.state === 'paused' ? 'Go on recording  Space' : 'Pause  Space'}
          onClick={() => void call('meeting:pause', live.state === 'live')} className={cn(ROUND, 'text-foreground hover:bg-accent')}>
          {live.state === 'paused' ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        </button>
        <StopButton />
      </div>
    </>
  )
}

function LiveLine({ line, fade, named, marked }: { line: Line; fade: number; named: boolean; marked: boolean }): React.JSX.Element {
  return (
    <p data-meeting-live-line={line.id} data-final={line.final || undefined} className="text-body text-pretty transition-opacity duration-300" style={{ opacity: fade }}>
      {named && <span className="mr-1.5 font-semibold">{speakerName(line.speaker)}</span>}
      {marked && <Bookmark role="img" aria-label="Moment noted" className="mr-1 inline size-3 -translate-y-px text-[var(--tt-brand-color-500)]" />}
      {line.text}
    </p>
  )
}

/** Before it records, and after: what will be recorded, the line about telling people, the Mac's permission, saving. */
function Before({ live, onChoose }: { live: Live; onChoose: () => void }): React.JSX.Element {
  const close = <button type="button" onClick={() => void call('meeting:stop')} className={cn(BUTTON, 'text-muted-foreground hover:bg-accent hover:text-foreground')}>{live.state === 'failed' || live.state === 'too-old' ? 'Close' : 'Not now'}</button>
  const body = (title: string, lines: React.ReactNode, actions?: React.ReactNode): React.JSX.Element => (
    <div className="flex h-full flex-col px-4 pt-3.5 pb-3">
      <p className="text-heading font-semibold">{title}</p>
      <div className="mt-1.5 flex-1 space-y-2 text-control text-pretty text-muted-foreground">{lines}</div>
      {actions && <div className="flex items-center justify-end gap-2">{actions}</div>}
    </div>
  )
  if (live.state === 'starting' || live.state === 'asking' || live.state === 'saving')
    return <div className="flex h-full items-center justify-center"><Orb label={live.state === 'saving' ? 'Keeping the recording…' : live.state === 'asking' ? 'macOS is asking…' : 'Getting ready…'} /></div>
  if (live.state === 'denied')
    return body("Haligtree can't hear the other side yet", <p>Allow Haligtree under “Screen & System Audio Recording” in System Settings, then start again.</p>, <>
      {close}
      <button type="button" onClick={() => void call('meeting:privacy')} className={cn(BUTTON, 'text-foreground hover:bg-accent')}>Open System Settings</button>
      <button type="button" data-meeting-start onClick={() => void call('meeting:begin')} className={cn(BUTTON, 'bg-[var(--tt-brand-color-500)] mf-on-accent hover:brightness-110')}>Try again</button>
    </>)
  if (live.state === 'failed' || live.state === 'too-old' || live.state === 'saved')
    return body(live.state === 'saved' ? 'Recording kept' : live.stopped ? 'The recording stopped' : 'Nothing was recorded', <p>{live.message}</p>, live.state === 'saved' ? undefined : close)
  return body(live.event?.title ? `Record ${quoted(live.event.title, 80)}` : 'Record a call or lecture', <>
    <p><b className="font-semibold text-foreground">{live.from.mic ? 'Your microphone and the sound from ' : 'The sound from '}{live.from.bundle ? live.from.name || 'one app' : 'this Mac'}</b>{live.from.bundle ? '' : ' (the call, in its app or the browser)'}, kept in your book. Nothing leaves this Mac.</p>
    <div className="space-y-1 [-webkit-app-region:no-drag]">
      <div className="flex h-7 items-center justify-between gap-3">
        <span className="text-control text-foreground">Sound from</span>
        <button type="button" data-meeting-from-button onClick={onChoose} className={cn(BUTTON, '-mr-2 max-w-[60%] pr-2 text-foreground hover:bg-accent')}>
          <span className="truncate">{fromName(live)}</span><ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </div>
      <label className="flex h-7 cursor-pointer items-center justify-between gap-3">
        <span className="text-control text-foreground">My microphone</span>
        <Switch data-meeting-mic checked={live.from.mic} onCheckedChange={(on) => void call('meeting:mic', on)} />
      </label>
    </div>
    {isBrowser(live.from.bundle) && <p data-meeting-browser className="text-foreground">Every tab in {live.from.name} is heard: mute the others.</p>}
    {live.first && <p data-meeting-consent className="text-foreground">Let people know you are recording. In many places you must.</p>}
  </>, <>
    {close}
    <button type="button" data-meeting-start autoFocus onClick={() => void call('meeting:begin')} className={cn(BUTTON, 'bg-[var(--tt-brand-color-500)] mf-on-accent hover:brightness-110')}>Start recording</button>
  </>)
}

/**
 * "Sound from", in the card itself: all of this Mac, or one app open now. The last choice is kept for next time;
 * changed while it records, the next sound comes from there at once.
 */
function SoundFrom({ live, onDone }: { live: Live; onDone: () => void }): React.JSX.Element {
  const [apps, setApps] = useState<SoundApp[] | null>(null)
  useEffect(() => void call<SoundApp[]>('meeting:apps').then((found) => setApps(found ?? [])).catch(() => setApps([])), [])
  const pick = (app: SoundApp | null): void => {
    chime('tick')
    void call('meeting:from', app)
    onDone()
  }
  const row = (key: string, label: React.ReactNode, on: boolean, run: () => void): React.JSX.Element => (
    <button key={key} type="button" role="menuitemradio" aria-checked={on} data-meeting-from={key} onClick={run}
      className="flex h-8 w-full shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-control text-foreground transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {on && <Check className="size-3.5 shrink-0 text-[var(--tt-brand-color-500)]" />}
    </button>
  )
  return (
    <div data-meeting-sound-from className="flex h-full flex-col [-webkit-app-region:no-drag]">
      <div className="flex h-10 shrink-0 items-center gap-1 px-2 pt-1">
        <button type="button" aria-label="Back" onClick={onDone} className={cn(ROUND, 'text-muted-foreground hover:bg-accent hover:text-foreground')}><ChevronLeft className="size-4" /></button>
        <span className="text-control font-semibold">Sound from</span>
      </div>
      <div role="menu" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {row('all', 'All of this Mac', !live.from.bundle, () => pick(null))}
        {apps === null ? <div className="flex h-16 items-center justify-center"><Orb label="Looking for apps…" /></div>
          : apps.map((app) => row(app.bundle, app.name, live.from.bundle === app.bundle, () => pick(app)))}
        {apps !== null && !apps.length && <p className="px-2 pt-1 text-meta text-muted-foreground">No other app is open that can make sound.</p>}
      </div>
    </div>
  )
}
