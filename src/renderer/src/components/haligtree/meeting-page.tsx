import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { glideWay } from '@/lib/motion'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Bookmark, CalendarDays, Check, CircleHelp, ListChecks, ListTodo, Mic, UserRound, X } from 'lucide-react'

import { cn } from '@/lib/cn'
import { chime } from '@/lib/sound'
import { num } from '../../../../main/dates'
import { makeTask } from '@/lib/tasks'
import { call, haligtree, useLive } from '@/lib/haligtree'
import { pointAtLine } from '@/extensions/meeting'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { SoundPlayer, clock } from './sound-player'
import { toast } from './ui'
import { readTake, type Take } from '@/lib/meeting-take'
import { aimNow, aimTaken } from '@/lib/meeting'
import { settledVoices, transcriptLines, voiceName, type ActionItem, type MeetingLine } from '../../../../main/meeting-doc'

type Found = { dates: Said[]; actions: Said[]; questions: Said[]; names: { name: string; times: number }[] }
type Said = { text: string; at: number; speaker?: string; date?: string | null }

const ROW = 'flex w-full cursor-pointer items-baseline gap-2.5 rounded-md px-2 py-1 text-left text-body transition-colors hover:bg-accent'
const CHIP = 'inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-meta text-muted-foreground transition-[color,border-color,scale] hover:border-foreground/25 hover:text-foreground active:scale-[0.97]'
const QUIET_BUTTON = 'flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-control text-muted-foreground transition-[color,background-color,scale,opacity] hover:bg-accent hover:text-foreground active:scale-[0.97]'
/** Motion off in Settings, or Reduce motion on. */

/**
 * A meeting's page, its own kind: when and how long, who was there (each voice named with one click), the recording
 * in the app's one player, the moments you noted, the action items, what to take from it, and every line said. All of
 * it is the meeting block's data (extensions/meeting.ts): the page draws it and nothing typed reaches it. A line plays
 * from its moment when clicked, is lit while it is said, and is fixed by a double-click ("Fix this line"); ⌘Z undoes
 * the fix as it undoes anything in the note.
 */
export function MeetingView({ node, editor, updateAttributes }: NodeViewProps): React.JSX.Element {
  const a = node.attrs as { audio: string; seconds: number; startedAt: string; event: { title: string } | null; people: string[]; speakers: string[]; names: Record<string, string>; moments: Said[]; found: Found | null; take: Record<string, unknown> | null; words: string | null; lines: MeetingLine[]; actions: ActionItem[]; heard: number | null; stopped: string | null; quietMic: string | null; readAgain: string | null }
  const lines = useMemo(() => a.lines ?? [], [a.lines])
  const box = useRef<HTMLDivElement>(null)
  const said = useRef<HTMLDivElement>(null)
  const [naming, setNaming] = useState<{ who: string; el: HTMLElement } | null>(null)
  const [fixing, setFixing] = useState<string | null>(null)
  const [lit, setLit] = useState(-1)
  const take = readTake(a.take)
  const nameOf = useCallback((who?: string): string => voiceName(who || 'you', a.names), [a.names])
  const editable = editor.isEditable

  const audio = (): HTMLAudioElement | null => box.current?.querySelector('[data-meeting-player] audio') ?? null
  // Play from a moment: a line, a noted moment, an item, a found line. The page follows the line from there.
  const following = useRef(true)
  const startedBy = useRef(0)
  const seek = useCallback((at: number): void => {
    const player = audio()
    if (!player) return
    player.currentTime = at
    following.current = true
    startedBy.current = performance.now()
    void player.play().catch(() => undefined)
  }, [])

  // The line being said, lit as it plays: the last line begun by the player's time.
  useEffect(() => {
    const player = audio()
    if (!player) return
    let frame = 0
    const find = (): void => {
      const t = player.currentTime
      const started = !player.paused || t > 0
      let at = -1
      if (started) {
        let lo = 0, hi = lines.length - 1
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (lines[mid].at <= t + 0.05) (at = mid, (lo = mid + 1)); else hi = mid - 1 }
      }
      setLit(at)
    }
    const tick = (): void => (find(), void (frame = player.paused ? 0 : requestAnimationFrame(tick)))
    const on = (): void => (cancelAnimationFrame(frame), tick())
    const events = ['play', 'pause', 'seeked', 'timeupdate', 'ended']
    events.forEach((one) => player.addEventListener(one, on))
    return () => (cancelAnimationFrame(frame), events.forEach((one) => player.removeEventListener(one, on)))
  }, [a.audio, lines])

  // The page follows the lit line only while it is in view, and stops the moment you scroll yourself; it follows
  // again once you play from a line or bring the lit line back into view.
  useEffect(() => {
    const scroller = scrollerOf(box.current)
    if (!scroller) return
    const own = (): void => void (following.current = false)
    const keys = (event: KeyboardEvent): void => void (/^(PageUp|PageDown|ArrowUp|ArrowDown|Home|End| )$/.test(event.key) && !editor.isDestroyed && !editor.view.dom.contains(document.activeElement) && own())
    scroller.addEventListener('wheel', own, { passive: true })
    scroller.addEventListener('touchmove', own, { passive: true })
    window.addEventListener('keydown', keys)
    return () => (scroller.removeEventListener('wheel', own), scroller.removeEventListener('touchmove', own), window.removeEventListener('keydown', keys))
  }, [editor])
  const was = useRef(-1)
  useEffect(() => {
    const before = was.current
    was.current = lit
    if (lit < 0 || lit === before) return
    const scroller = scrollerOf(box.current)
    const row = said.current?.querySelector<HTMLElement>(`[data-line-index="${lit}"]`)
    if (!scroller || !row) return
    const view = scroller.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    const inView = (one: DOMRect): boolean => one.bottom > view.top && one.top < view.bottom
    const prior = before >= 0 ? said.current?.querySelector<HTMLElement>(`[data-line-index="${before}"]`)?.getBoundingClientRect() : null
    // Scrolled away and back by hand to where it plays: it follows again.
    if (!following.current && r.top >= view.top && r.bottom <= view.bottom) following.current = true
    if (!following.current || !(inView(r) || (prior && inView(prior)))) return
    // Kept in the middle third: moved only as it nears the foot of the page.
    if (r.bottom > view.top + view.height * 0.7 || r.top < view.top + view.height * 0.15)
      scroller.scrollBy({ top: r.top - (view.top + view.height * 0.35), behavior: glideWay() })
  }, [lit])

  useEffect(() => {
    const onName = (event: Event): void => {
      const { who, el } = (event as CustomEvent<{ who: string; el: HTMLElement }>).detail
      if (box.current?.contains(el)) setNaming({ who, el })
    }
    // "Fix this line" from the block's own menu (block-menu.tsx), for the line right-clicked.
    const onFix = (event: Event): void => {
      const { id, editor: from } = (event as CustomEvent<{ id: string; editor: unknown }>).detail
      if (from === editor && lines.some((one) => one.id === id)) setFixing(id)
    }
    window.addEventListener('haligtree:meeting-name', onName)
    window.addEventListener('haligtree:meeting-fix', onFix)
    return () => (window.removeEventListener('haligtree:meeting-name', onName), window.removeEventListener('haligtree:meeting-fix', onFix))
  }, [editor, lines])

  // Opened from a search hit on one of its lines (⌘K): scrolled to that line, lit a moment, the player waiting there.
  useEffect(() => {
    let off = 0
    let frame = 0
    const land = (): void => {
      const aim = aimNow()
      if (!aim || !box.current?.isConnected) return
      const index = lines.findIndex((one) => one.text.includes(aim)) >= 0 ? lines.findIndex((one) => one.text.includes(aim)) : lines.findIndex((one) => one.text.trim() && aim.includes(one.text.trim()))
      if (index < 0) return
      const hit = said.current?.querySelector<HTMLElement>(`[data-line-index="${index}"]`)
      // Not drawn yet (the view it lives in is still coming in): looked for again next frame, while the ask is fresh.
      if (!hit || !hit.getClientRects().length) return void (frame = requestAnimationFrame(land))
      hit.scrollIntoView({ block: 'center', behavior: 'instant' })
      // Only the copy truly on screen takes it: a page kept behind another view (still laid out) leaves it for the one shown.
      const r = hit.getBoundingClientRect()
      if (!hit.contains(document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 10)))) return void (frame = requestAnimationFrame(land))
      aimTaken()
      hit.setAttribute('data-found', '')
      const player = audio()
      if (player) (player.pause(), (player.currentTime = lines[index].at))
      clearTimeout(off)
      off = window.setTimeout(() => hit.removeAttribute('data-found'), 1600)
    }
    const soon = (): void => (cancelAnimationFrame(frame), void (frame = requestAnimationFrame(() => (frame = requestAnimationFrame(land)))))
    soon()
    window.addEventListener('haligtree:meeting-aim', soon)
    return () => (cancelAnimationFrame(frame), clearTimeout(off), window.removeEventListener('haligtree:meeting-aim', soon))
  }, [editor, lines])

  // ⌫ and Delete pressed inside the meeting (on a time, a speaker, a line just clicked) delete nothing: not a line, not
  // the meeting, and never the note around it, which the app's list keys would take for "to the Bin".
  useEffect(() => {
    const el = box.current
    if (!el) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Backspace' && event.key !== 'Delete') return
      if ((event.target as Element).closest('input, textarea, [contenteditable="true"]')) return
      event.preventDefault()
      event.stopPropagation()
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [])

  // Copied or dragged out of the transcript: the lines picked, as plain quoted lines with their times as text.
  useEffect(() => {
    const el = said.current
    if (!el) return
    const picked = (): MeetingLine[] => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return []
      return [...el.querySelectorAll<HTMLElement>('[data-line-index]')].filter((row) => selection.containsNode(row, true)).map((row) => lines[Number(row.dataset.lineIndex)]).filter(Boolean)
    }
    const put = (data: DataTransfer | null, rows: MeetingLine[]): void => {
      const text = transcriptLines(rows, a.names)
      data?.setData('text/plain', text.join('\n'))
      data?.setData('text/html', `<blockquote>${text.map((one) => `<p>${one.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('')}</blockquote>`)
    }
    const onCopy = (event: ClipboardEvent): void => {
      const rows = picked()
      if (!rows.length) return
      event.preventDefault()
      event.stopPropagation()
      put(event.clipboardData, rows)
    }
    const onDrag = (event: DragEvent): void => {
      const rows = picked()
      event.stopPropagation()
      if (!rows.length) return void event.preventDefault()
      put(event.dataTransfer, rows)
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
    }
    el.addEventListener('copy', onCopy)
    el.addEventListener('cut', onCopy)
    el.addEventListener('dragstart', onDrag)
    return () => (el.removeEventListener('copy', onCopy), el.removeEventListener('cut', onCopy), el.removeEventListener('dragstart', onDrag))
  }, [lines, a.names])

  const name = (who: string, as: string): void => {
    const before = a.names
    const next = { ...a.names, [who]: as.trim() }
    if (!as.trim()) delete next[who]
    updateAttributes({ names: next })
    setNaming(null)
    chime('tag')
    toast(as.trim() ? `Every line of ${voiceName(who, before)} is ${as.trim()}'s now` : 'Named again as a speaker', () => updateAttributes({ names: before }))
  }

  const fix = (id: string, words: string): void => {
    setFixing(null)
    const line = lines.find((one) => one.id === id)
    const text = words.replace(/\s+/g, ' ').trim()
    // Back to the note, so ⌘Z reaches the fix.
    if (!editor.isDestroyed) editor.view.focus()
    if (!line || !text || text === line.text) return
    updateAttributes({ lines: lines.map((one) => (one.id === id ? { ...one, text } : one)) })
    chime('saved')
  }

  // A recording kept before its voices were settled, or before Apple Intelligence read it (8 Nov: nine voices for one
  // person, "tell the same" as an action item): done once as it opens. The voices at once, said at once with their
  // Undo; then Apple Intelligence, where this Mac has it, reads the lines with the voices settled (a minute or more for
  // an hour), and says what it found when it has, with its own Undo. Marked as read again, Undo too, so it is done once.
  const settling = useRef(false)
  const latest = useRef(node)
  latest.current = node
  useEffect(() => {
    if (!editable || settling.current || !lines.length || a.readAgain) return
    const settled = settledVoices({ lines, speakers: a.speakers, names: a.names, actions: a.actions, moments: a.moments })
    if (!settled && a.take) return
    settling.current = true
    const stamp = new Date().toISOString()
    if (settled) {
      const was = { lines: a.lines, speakers: a.speakers, names: a.names, moments: a.moments, actions: a.actions }
      updateAttributes({ lines: settled.lines, speakers: settled.speakers, names: settled.names, actions: settled.actions, moments: settled.moments, readAgain: stamp })
      chime('settled')
      // Its items go back too only while they are still the ones it had: Apple Intelligence's, come since, stay.
      toast(`${num(settled.speakers.length)} speakers in this recording, not ${num(settled.was)}: a voice heard in under 1 line in 20 is one of the others misheard`,
        () => updateAttributes({ ...was, actions: latest.current.attrs.take ? latest.current.attrs.actions : was.actions, readAgain: stamp }))
    }
    if (a.take) return
    void call<{ take: Record<string, unknown>; actions: ActionItem[] } | { unavailable: string } | { failed: string }>('meeting:read-again', settled?.lines ?? lines).then((read) => {
      if (editor.isDestroyed || !('take' in read)) return
      const before = { take: latest.current.attrs.take, actions: latest.current.attrs.actions as ActionItem[] }
      // Ticked or made a task already: that item is kept as it is.
      const kept = (before.actions ?? []).filter((one) => one.done || one.task)
      updateAttributes({ take: read.take, actions: [...kept, ...read.actions.map((one, at) => ({ ...one, id: `a${kept.length + at}` }))], readAgain: stamp })
      chime('settled')
      toast(read.actions.length ? `Apple Intelligence read this recording and found ${num(read.actions.length)} action ${read.actions.length === 1 ? 'item' : 'items'}` : 'Apple Intelligence read this recording and found no action items in it',
        () => updateAttributes({ ...before, readAgain: stamp }))
    }, () => undefined)
  }, [editable, lines.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const dropRecording = (): void => {
    const before = { audio: a.audio, you: node.attrs.you, others: node.attrs.others }
    updateAttributes({ audio: '', you: '', others: '' })
    chime('away')
    toast('Recording deleted, the words kept', () => updateAttributes(before))
  }
  const drop = useRef(dropRecording)
  drop.current = dropRecording
  useEffect(() => {
    const onDrop = (event: Event): void => void ((event as CustomEvent).detail === editor && drop.current())
    window.addEventListener('haligtree:meeting-drop-audio', onDrop)
    return () => window.removeEventListener('haligtree:meeting-drop-audio', onDrop)
  }, [editor])

  const when = a.startedAt ? new Date(a.startedAt) : null
  const voices = ['you', ...a.speakers]
  const quietAfter = a.heard != null && a.seconds - a.heard > 20 ? a.heard : null
  const onLine = useCallback((index: number, event: React.MouseEvent): void => {
    if (event.detail === 2 && editable) {
      // The word a double-click picks is let go: the whole line's words open instead.
      window.getSelection()?.removeAllRanges()
      // The first press of a double-click began playing: undone, the fix is what was meant.
      const player = audio()
      if (player && performance.now() - startedBy.current < 700) player.pause()
      return setFixing(lines[index].id)
    }
    // A drag that picked words is a selection, not a press.
    if (event.detail === 1 && window.getSelection()?.isCollapsed !== false) seek(lines[index].at)
  }, [lines, seek, editable])

  const play = useCallback((index: number): void => seek(lines[index].at), [lines, seek])

  return (
    <NodeViewWrapper data-meeting-page className="mf-meeting not-prose my-2" contentEditable={false}>
      <div ref={box} className="space-y-4">
        <div className="space-y-4 select-none">
          <div data-meeting-length className="text-meta text-muted-foreground">
            Recorded{when && ` ${when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} at ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`} · {clock(a.seconds)} long
            {quietAfter != null && <span data-meeting-quiet> · nothing heard after {clock(quietAfter)}</span>}
          </div>
          {a.stopped && <div data-meeting-stopped className="text-body text-pretty"><b className="font-semibold">This recording stopped early{a.stopped === 'disk' ? ' because the disk was full' : ''}.</b> Everything up to that moment was saved.</div>}
          {a.quietMic != null && <div data-meeting-quiet-mic className="text-body text-pretty"><b className="font-semibold">Your microphone{a.quietMic ? ` (${a.quietMic})` : ''} heard almost nothing, so your side is missing.</b> Was the call on a headset? Haligtree records the microphone chosen in System Settings, Sound, Input: choose the one the call uses.</div>}
          <div data-meeting-voices className="flex flex-wrap items-center gap-1.5">
            {voices.map((who) => (
              <button key={who} type="button" data-meeting-voice={who} disabled={who === 'you'} onClick={(event) => setNaming({ who, el: event.currentTarget })}
                className={cn(CHIP, who === 'you' && 'cursor-default hover:border-border hover:text-muted-foreground active:scale-100')}>
                <UserRound className="size-3" />{nameOf(who)}
              </button>
            ))}
            {a.speakers.length > 0 && !Object.keys(a.names).length && <span className="text-meta text-muted-foreground">Told apart by voice: click a name to say who it is.</span>}
          </div>
          {a.audio
            ? <div data-meeting-player><SoundPlayer src={a.audio} length={a.seconds} name="The recording" /></div>
            : <div data-meeting-no-audio className="text-control text-muted-foreground">The recording was deleted. The words are kept below.</div>}

          {a.moments.length > 0 && (
            <Section icon={<Bookmark className="size-3.5" />} title="Moments you noted" count={a.moments.length}>
              {a.moments.map((one, at) => <Row key={at} line={one} onSeek={seek} who={one.speaker ? nameOf(one.speaker) : undefined} lead={one.text ? undefined : 'A moment'} />)}
            </Section>
          )}

          <ActionItems items={a.actions ?? []} nameOf={nameOf} onSeek={seek} editable={editable} by={take ? (take.standIn ? 'stand-in' : 'ai') : 'found'}
            noteId={() => (editor.isDestroyed ? undefined : editor.view.dom.closest<HTMLElement>('[data-open]')?.dataset.open)}
            onChange={(actions) => updateAttributes({ actions })} />

          <TakeAway take={take} found={a.found} seek={seek} nameOf={nameOf} />
        </div>

        {!lines.length && <div data-meeting-nothing className="text-control text-muted-foreground select-none">Nothing was said to take anything from.</div>}
        {lines.length > 0 && <div className="flex items-center gap-1.5 pt-1 text-meta text-muted-foreground select-none"><Mic className="size-3" />What was said, by who: click a line to play from there, double-click to fix a word.</div>}
        <div ref={said} data-meeting-transcript onContextMenu={(event) => pointAtLine((event.target as Element).closest<HTMLElement>('[data-meeting-line]')?.dataset.meetingLineId ?? null)}>
          {lines.map((line, index) => (
            <Line key={line.id} line={line} index={index} name={nameOf(line.who)} same={index > 0 && lines[index - 1].who === line.who} lit={index === lit}
              fixing={fixing === line.id} onPlay={play} onPress={onLine} onFix={fix} onCancel={() => (setFixing(null), !editor.isDestroyed && editor.view.focus())}
              onName={(el) => line.who !== 'you' && setNaming({ who: line.who, el })} />
          ))}
        </div>
      </div>
      {naming && <NameVoice who={naming.who} el={naming.el} was={a.names[naming.who] ?? ''} people={a.people} onName={(as) => name(naming.who, as)} onClose={() => setNaming(null)} />}
    </NodeViewWrapper>
  )
}

/** The nearest box that scrolls the page the meeting is in. */
function scrollerOf(el: Element | null): HTMLElement | null {
  for (let at = el?.parentElement; at; at = at.parentElement) {
    const style = getComputedStyle(at)
    if (/(auto|scroll)/.test(style.overflowY) && at.scrollHeight > at.clientHeight) return at
  }
  return document.scrollingElement as HTMLElement | null
}

/** One line said: who (only where the voice changes), when, and the words, lit while it is said. */
const Line = memo(function Line({ line, index, name, same, lit, fixing, onPlay, onPress, onFix, onCancel, onName }: {
  line: MeetingLine; index: number; name: string; same: boolean; lit: boolean; fixing: boolean; onPlay: (index: number) => void
  onPress: (index: number, event: React.MouseEvent) => void; onFix: (id: string, words: string) => void; onCancel: () => void; onName: (el: HTMLElement) => void
}): React.JSX.Element {
  return (
    <div data-meeting-line data-meeting-line-id={line.id} data-line-index={index} data-who={line.who} data-at={line.at} data-marked={line.marked || undefined} data-same={same || undefined} data-lit={lit || undefined}
      className="mf-meeting-line" onClick={(event) => !fixing && !(event.target as Element).closest('button') && onPress(index, event)}>
      <div className="mf-meeting-gutter">
        <button type="button" className="mf-meeting-name" data-speaker={line.who} title={line.who === 'you' ? undefined : 'Who is this?'} onClick={(event) => onName(event.currentTarget)}>{name}</button>
        <button type="button" className="mf-meeting-time" title="Play from here" onClick={() => onPlay(index)}>{clock(line.at)}</button>
      </div>
      {fixing ? <FixLine words={line.text} onDone={(words) => onFix(line.id, words)} onCancel={onCancel} /> : <div className="mf-meeting-words">{line.text}</div>}
    </div>
  )
})

/** The words of one line, open to change: Return keeps them, Esc leaves them as they were. Its time and voice stay. */
function FixLine({ words, onDone, onCancel }: { words: string; onDone: (words: string) => void; onCancel: () => void }): React.JSX.Element {
  const field = useRef<HTMLTextAreaElement>(null)
  const gone = useRef(false)
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  })
  useEffect(() => void (field.current?.focus(), field.current?.select()), [])
  return (
    <textarea ref={field} data-meeting-fix defaultValue={words} rows={1} aria-label="Fix this line"
      onInput={(event) => ((event.currentTarget.style.height = '0px'), (event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`))}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter' && !event.shiftKey) (event.preventDefault(), (gone.current = true), onDone(event.currentTarget.value))
        else if (event.key === 'Escape') (event.preventDefault(), (gone.current = true), onCancel())
      }}
      onBlur={(event) => !gone.current && onDone(event.currentTarget.value)}
      className="mf-meeting-words mf-meeting-fix w-full resize-none overflow-hidden bg-transparent outline-none" />
  )
}

/** The action items: each with its words, who owns it, the day said and its moment; ticked, made a task, fixed or let go. */
function ActionItems({ items, nameOf, onSeek, editable, by, noteId, onChange }: {
  items: ActionItem[]; nameOf: (who?: string) => string; onSeek: (at: number) => void; editable: boolean; by: 'ai' | 'stand-in' | 'found'
  noteId: () => string | undefined; onChange: (items: ActionItem[]) => void
}): React.JSX.Element | null {
  const [editing, setEditing] = useState<string | null>(null)
  // A long meeting's many items: the first few, the rest a click away, the count said.
  const [all, setAll] = useState(false)
  const ids = items.map((one) => one.task).filter(Boolean) as string[]
  // The tasks they became, as they are now: ticked in Tasks, ticked here.
  const tasks = useLive(() => Promise.all(ids.map((id) => haligtree.task(id).catch(() => null))), [] as (Awaited<ReturnType<typeof haligtree.task>>)[], [ids.join()])
  const taskOf = (id: string | null) => (id ? tasks.find((one) => one?.id === id) ?? null : null)
  if (!items.length) return null
  const set = (id: string, change: Partial<ActionItem>): void => onChange(items.map((one) => (one.id === id ? { ...one, ...change } : one)))
  const owner = (item: ActionItem): string => (/^(you|s\d+)$/.test(item.owner) ? nameOf(item.owner) : item.owner)

  const tick = async (item: ActionItem): Promise<void> => {
    const task = taskOf(item.task)
    const done = task ? task.status === 'done' : item.done
    chime(done ? 'off' : 'done')
    set(item.id, { done: !done })
    if (!task) return
    if (!done) await haligtree.doneTask(task.id)
    else await haligtree.undoneTask(task.id, { dueAt: task.dueAt, doneAt: task.completedAt ?? '', notifiedAt: null } as never)
  }
  const toTask = async (item: ActionItem): Promise<void> => {
    const who = owner(item)
    const day = item.date && !/\b(by|on|before)\s+\w+day\b|tomorrow|today|tonight|next week/i.test(item.text)
      ? ` by ${new Date(`${item.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}` : ''
    const made = await makeTask({ text: `${who === 'You' ? '' : `${who}: `}${item.text}${day}`, origin: noteId() }, `Kept as a task${who === 'You' ? '' : ` for ${who}`}`)
    if (made) set(item.id, { task: made.id })
  }
  const notOne = (item: ActionItem): void => {
    chime('away')
    onChange(items.filter((one) => one.id !== item.id))
    toast('Not an action: taken off the list', () => onChange(items))
  }

  return (
    <div data-meeting-actions={by}>
      <div className="mb-0.5 flex items-center gap-1.5 text-heading font-semibold"><ListChecks className="size-4" />Action items<span className="text-control font-normal text-muted-foreground tabular-nums">{num(items.length)}</span></div>
      <div className="mb-1.5 text-meta text-muted-foreground">
        {by === 'ai' ? 'Written by Apple Intelligence on this Mac. Check them against the words below.' : by === 'stand-in' ? 'A stand-in for Apple Intelligence, made for testing from the lines below.' : 'Lines found in what was said that promise or ask for something. Not a summary: check each against its moment.'}
      </div>
      <ul className="-mx-2 m-0 list-none p-0">
        {(all ? items : items.slice(0, 8)).map((item) => {
          const task = taskOf(item.task)
          const done = task ? task.status === 'done' : item.done
          return (
            <li key={item.id} data-meeting-item={item.id} data-done={done || undefined} className="group flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60">
              <button type="button" role="checkbox" aria-checked={done} aria-label={item.text} data-meeting-tick disabled={!editable} onClick={() => void tick(item)}
                className="relative mt-[0.1875rem] grid size-[1.125rem] shrink-0 cursor-pointer place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,scale] duration-150 ease-out outline-none before:absolute before:-inset-1.5 before:content-[''] active:scale-90 focus-visible:ring-2 focus-visible:ring-ring/40"
                style={{ borderColor: done ? 'var(--tt-color-text-green)' : 'color-mix(in oklab, var(--muted-foreground) 70%, transparent)', background: done ? 'var(--tt-color-text-green)' : undefined }}>
                <Check className={cn('size-2.5 text-white transition-[opacity,scale] duration-150 ease-out', done ? 'scale-100 opacity-100' : 'scale-50 opacity-0')} strokeWidth={3} />
              </button>
              <div className="min-w-0 flex-1">
                {editing === item.id ? (
                  <input autoFocus data-meeting-item-edit defaultValue={item.text} aria-label="The action's words"
                    onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') (event.preventDefault(), event.currentTarget.blur()); if (event.key === 'Escape') (event.preventDefault(), (event.currentTarget.value = item.text), event.currentTarget.blur()) }}
                    onBlur={(event) => { const text = event.currentTarget.value.trim(); setEditing(null); if (text && text !== item.text) set(item.id, { text }) }}
                    className="w-full bg-transparent text-body outline-none" />
                ) : (
                  <div data-meeting-item-text onDoubleClick={() => editable && setEditing(item.id)} className={cn('text-body text-pretty', done && 'text-muted-foreground line-through decoration-muted-foreground/50')}>{item.text}</div>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-meta text-muted-foreground">
                  <span data-meeting-owner className="inline-flex items-center gap-1 font-medium text-(--mf-muted-strong)"><UserRound className="size-3" />{owner(item)}</span>
                  {item.date && <span data-meeting-due className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
                  <button type="button" data-meeting-item-at onClick={() => onSeek(item.at)} className="cursor-pointer tabular-nums hover:text-foreground" title="Play from here">{clock(item.at)}</button>
                  {task && <span data-meeting-item-task className="inline-flex items-center gap-1"><ListTodo className="size-3" />In Tasks</span>}
                </div>
              </div>
              {editable && (
                <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {!task && <button type="button" data-meeting-task onClick={() => void toTask(item)} className={QUIET_BUTTON}><ListTodo className="size-3.5" />Make it a task</button>}
                  <button type="button" data-meeting-not onClick={() => notOne(item)} className={QUIET_BUTTON}><X className="size-3.5" />Not an action</button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {items.length > 8 && (
        <button type="button" data-meeting-items-more onClick={() => (chime(all ? 'fold' : 'open'), setAll(!all))} className={cn(QUIET_BUTTON, '-ml-2 mt-0.5')}>
          {all ? 'Show fewer' : `Show all ${num(items.length)}`}
        </button>
      )}
    </div>
  )
}

/** What to take from it: Apple Intelligence's summary and lists, or every other Mac's lines found, said to be found. */
function TakeAway({ take, found, seek, nameOf }: { take: Take | null; found: Found | null; seek: (at: number) => void; nameOf: (who?: string) => string }): React.JSX.Element | null {
  if (!take && !found) return null
  const any = take ? take.summary || take.decisions.length || take.questions.length || take.missed.length : found!.dates.length || found!.questions.length || found!.names.length
  if (!any) return null
  return (
    <div data-meeting-take={take ? (take.standIn ? 'stand-in' : 'ai') : 'found'} className="space-y-3">
      <div className="text-heading font-semibold">What to take from it</div>
      {take ? (
        <>
          <div className="text-meta text-muted-foreground">{take.standIn ? 'A stand-in for Apple Intelligence, made for testing from the lines below.' : 'Written by Apple Intelligence on this Mac. Check it against the words below.'}</div>
          {take.summary && <div data-meeting-summary className="text-body text-pretty">{take.summary}</div>}
          <Lines title="Decisions" lines={take.decisions} onSeek={seek} nameOf={nameOf} />
          <Lines title="Questions left open" lines={take.questions} onSeek={seek} nameOf={nameOf} />
          <Lines title="What you may have missed" lines={take.missed} onSeek={seek} nameOf={nameOf} />
        </>
      ) : (
        <>
          <div className="text-meta text-muted-foreground">Lines found in what was said, not a summary: each plays from its moment.</div>
          <Lines title="Dates and times said" lines={found!.dates} onSeek={seek} nameOf={nameOf} icon={<CalendarDays className="size-3.5" />} />
          <Lines title="Questions asked" lines={found!.questions} onSeek={seek} nameOf={nameOf} icon={<CircleHelp className="size-3.5" />} />
          {found!.names.length > 0 && <div className="text-control text-muted-foreground">Names said: {found!.names.map((one) => one.name).join(', ')}</div>}
        </>
      )}
    </div>
  )
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-control font-semibold">{icon}{title}<span className="font-normal text-muted-foreground tabular-nums">{count}</span></div>
      <div className="-mx-2">{children}</div>
    </div>
  )
}

function Row({ line, onSeek, lead, who }: { line: Said; onSeek: (at: number) => void; lead?: string; who?: string }): React.JSX.Element {
  return (
    <button type="button" data-meeting-row onClick={() => onSeek(line.at)} className={ROW}>
      <span className="w-10 shrink-0 text-meta tabular-nums text-muted-foreground">{clock(line.at)}</span>
      {who && <span className="shrink-0 font-semibold">{who}</span>}
      <span className="min-w-0 flex-1 text-pretty">{lead ?? line.text}</span>
    </button>
  )
}

function Lines({ title, lines, onSeek, nameOf, icon }: { title: string; lines: (Said & { owner?: string })[]; onSeek: (at: number) => void; nameOf: (who?: string) => string; icon?: React.ReactNode }): React.JSX.Element | null {
  if (!lines.length) return null
  return (
    <Section icon={icon} title={title} count={lines.length}>
      {lines.map((line, at) => <Row key={at} line={line} onSeek={onSeek} who={line.speaker || line.owner ? nameOf(line.owner ?? line.speaker) : undefined} />)}
    </Section>
  )
}

/** "Who is this?": a name typed, or one of the people on the meeting's invitation in one click. */
function NameVoice({ who, el, was, people, onName, onClose }: { who: string; el: HTMLElement; was: string; people: string[]; onName: (name: string) => void; onClose: () => void }): React.JSX.Element {
  const [text, setText] = useState(was)
  const anchor = useRef(el)
  anchor.current = el
  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor virtualRef={anchor} />
      {/* Closed, the focus goes back to the name pressed: still in the note, so a key after it is the note's. */}
      <PopoverContent data-meeting-naming align="start" className="w-64 gap-2 p-3" onCloseAutoFocus={(event) => (event.preventDefault(), anchor.current.isConnected && anchor.current.focus({ preventScroll: true }))}>
        <div className="text-control font-semibold">Who is {was || voiceName(who)}?</div>
        <input autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Their name"
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), onName(text))}
          className="h-7 w-full rounded-md border bg-transparent px-2 text-control outline-none focus:border-foreground/25" />
        {people.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {people.map((one) => <button key={one} type="button" data-meeting-person onClick={() => onName(one)} className={CHIP}>That's {one}</button>)}
          </div>
        )}
        <div className="text-meta text-muted-foreground">Every line in this voice takes the name.</div>
      </PopoverContent>
    </Popover>
  )
}

export type { Take }
