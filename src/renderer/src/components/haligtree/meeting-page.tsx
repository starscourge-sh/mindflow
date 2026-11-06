import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Bookmark, CalendarDays, CircleHelp, ListTodo, Mic, UserRound } from 'lucide-react'

import { cn } from '@/lib/cn'
import { chime } from '@/lib/sound'
import { makeTask } from '@/lib/tasks'
import { renameLines } from '@/extensions/meeting'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { SoundPlayer, clock } from './sound-player'
import { toast } from './ui'
import { readTake, type Take } from '@/lib/meeting-take'
import { aimNow, aimTaken } from '@/lib/meeting'

type Found = { dates: Said[]; actions: Said[]; questions: Said[]; names: { name: string; times: number }[] }
type Said = { text: string; at: number; speaker?: string; date?: string | null }

const ROW = 'flex w-full cursor-pointer items-baseline gap-2.5 rounded-md px-2 py-1 text-left text-body transition-colors hover:bg-accent'
const CHIP = 'inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-meta text-muted-foreground transition-[color,border-color,scale] hover:border-foreground/25 hover:text-foreground active:scale-[0.97]'

/**
 * A meeting's page, at the top of its note: when and how long, who was there (each voice named with one click), the
 * recording in the app's one player, the moments you noted, and what to take from it. With Apple Intelligence that is
 * a summary, decisions, actions with owners, open questions and what was said about you; on every other Mac the same
 * headings hold the lines themselves, found and said to be found, never passed off as a summary. Every line plays
 * the recording from its moment; every action becomes a task in one click.
 */
export function MeetingView({ node, editor, updateAttributes }: NodeViewProps): React.JSX.Element {
  const a = node.attrs as { audio: string; seconds: number; startedAt: string; event: { title: string } | null; people: string[]; speakers: string[]; names: Record<string, string>; moments: Said[]; found: Found | null; take: Record<string, unknown> | null; words: string | null }
  const box = useRef<HTMLDivElement>(null)
  const [naming, setNaming] = useState<{ who: string; el: HTMLElement } | null>(null)
  const take = readTake(a.take)
  const nameOf = (who?: string): string => (!who || who === 'you' ? 'You' : a.names[who] || `Speaker ${who.replace(/^s/, '')}`)

  // Play from a moment: a line's time, a noted moment, a found line.
  const seek = (at: number): void => {
    const audio = box.current?.querySelector('audio')
    if (!audio) return
    audio.currentTime = at
    void audio.play().catch(() => undefined)
  }
  useEffect(() => {
    const own = (el: unknown): boolean => el instanceof Element && editor.view.dom.contains(el)
    const onSeek = (event: Event): void => {
      const { at, el } = (event as CustomEvent<{ at: number; el: Element }>).detail
      if (own(el)) seek(at)
    }
    const onName = (event: Event): void => {
      const { who, el } = (event as CustomEvent<{ who: string; el: HTMLElement }>).detail
      if (own(el)) setNaming({ who, el })
    }
    window.addEventListener('haligtree:meeting-seek', onSeek)
    window.addEventListener('haligtree:meeting-name', onName)
    return () => (window.removeEventListener('haligtree:meeting-seek', onSeek), window.removeEventListener('haligtree:meeting-name', onName))
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps
  // Opened from a search hit on one of its lines (⌘K): scrolled to that line, lit a moment, the player waiting there.
  useEffect(() => {
    let off = 0
    let frame = 0
    const land = (): void => {
      const aim = aimNow()
      if (!aim || !editor.view.dom.isConnected) return
      // Only the page that holds the line: another meeting open elsewhere leaves it be.
      if (![...editor.view.dom.querySelectorAll('.mf-meeting-words')].some((one) => one.textContent?.includes(aim) || aim.includes(one.textContent?.trim() || '\u0000'))) return
      const lines = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-meeting-line]')]
      const hit = lines.find((one) => one.querySelector('.mf-meeting-words')?.textContent?.includes(aim)) ?? lines.find((one) => aim.includes(one.querySelector('.mf-meeting-words')?.textContent?.trim() || '\u0000'))
      // Not drawn yet (the view it lives in is still coming in): looked for again next frame, while the ask is fresh.
      if (!hit || !hit.getClientRects().length) return void (frame = requestAnimationFrame(land))
      aimTaken()
      hit.scrollIntoView({ block: 'center', behavior: 'instant' })
      hit.setAttribute('data-found', '')
      const audio = box.current?.querySelector('audio')
      if (audio) (audio.pause(), (audio.currentTime = Number(hit.dataset.at ?? 0)))
      clearTimeout(off)
      off = window.setTimeout(() => hit.removeAttribute('data-found'), 1600)
    }
    // On opening, and when a page already open is asked again: a frame on, once the page shows its lines.
    const soon = (): void => (cancelAnimationFrame(frame), void (frame = requestAnimationFrame(() => (frame = requestAnimationFrame(land)))))
    soon()
    window.addEventListener('haligtree:meeting-aim', soon)
    return () => (cancelAnimationFrame(frame), clearTimeout(off), window.removeEventListener('haligtree:meeting-aim', soon))
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps
  // A voice named: every line of it says so at once.
  useEffect(() => renameLines(editor), [a.names, editor])

  const name = (who: string, as: string): void => {
    const was = a.names
    const next = { ...a.names, [who]: as.trim() }
    if (!as.trim()) delete next[who]
    updateAttributes({ names: next })
    setNaming(null)
    chime('tag')
    toast(as.trim() ? `Every line of ${was[who] || `Speaker ${who.replace(/^s/, '')}`} is ${as.trim()}'s now` : 'Named again as a speaker', () => updateAttributes({ names: was }))
  }

  const toTask = async (line: Said & { owner?: string }): Promise<void> => {
    const owner = nameOf(line.owner ?? line.speaker)
    const id = editor.view.dom.closest<HTMLElement>('[data-open]')?.dataset.open
    const text = `${owner === 'You' ? '' : `${owner}: `}${line.text.replace(/^(i'll|i will)\s+/i, '')}`
    await makeTask({ text, origin: id }, `Kept as a task${owner === 'You' ? '' : ` for ${owner}`}`)
  }

  const dropRecording = (): void => {
    const was = { audio: a.audio, you: node.attrs.you, others: node.attrs.others }
    updateAttributes({ audio: '', you: '', others: '' })
    chime('away')
    toast('Recording deleted, the words kept', () => updateAttributes(was))
  }
  // From the block's own menu ("Delete the recording, keep the words").
  const drop = useRef(dropRecording)
  drop.current = dropRecording
  useEffect(() => {
    const onDrop = (event: Event): void => void ((event as CustomEvent).detail === editor && drop.current())
    window.addEventListener('haligtree:meeting-drop-audio', onDrop)
    return () => window.removeEventListener('haligtree:meeting-drop-audio', onDrop)
  }, [editor])

  const when = a.startedAt ? new Date(a.startedAt) : null
  const voices = ['you', ...a.speakers]
  const took = take ?? (a.found ? null : undefined)

  return (
    <NodeViewWrapper data-meeting-page className="mf-meeting not-prose my-2 select-none" contentEditable={false}>
          <div ref={box} className="space-y-4">
            {/* When, how long, and how the words came. */}
            <div className="text-meta text-muted-foreground">
              Recorded{when && ` ${when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} at ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`} · {clock(a.seconds)} long
            </div>
            {/* Who was there: you, and each voice the Mac told apart; one click names one. */}
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
              ? <SoundPlayer src={a.audio} length={a.seconds} name="The meeting" />
              : <div data-meeting-no-audio className="text-control text-muted-foreground">The recording was deleted. The words are kept below.</div>}

            {a.moments.length > 0 && (
              <Section icon={<Bookmark className="size-3.5" />} title="Moments you noted" count={a.moments.length}>
                {a.moments.map((one, at) => <Row key={at} line={one} onSeek={seek} who={one.speaker ? nameOf(one.speaker) : undefined} lead={one.text ? undefined : 'A moment'} />)}
              </Section>
            )}

            <div data-meeting-take={take ? (take.standIn ? 'stand-in' : 'ai') : 'found'} className="space-y-3">
              <div className="text-heading font-semibold">What to take from it</div>
              {took === undefined && <div className="text-control text-muted-foreground">Nothing was said to take anything from.</div>}
              {take && (
                <>
                  <div className="text-meta text-muted-foreground">{take.standIn ? 'A stand-in for Apple Intelligence, made for testing from the lines below.' : 'Written by Apple Intelligence on this Mac. Check it against the words below.'}</div>
                  {take.summary && <div data-meeting-summary className="text-body text-pretty">{take.summary}</div>}
                  <Lines title="Decisions" lines={take.decisions} onSeek={seek} nameOf={nameOf} />
                  <Lines title="To do" lines={take.actions} onSeek={seek} nameOf={nameOf} owners onTask={toTask} />
                  <Lines title="Questions left open" lines={take.questions} onSeek={seek} nameOf={nameOf} />
                  <Lines title="What you may have missed" lines={take.missed} onSeek={seek} nameOf={nameOf} />
                </>
              )}
              {!take && a.found && (
                <>
                  <div className="text-meta text-muted-foreground">Lines found in what was said, not a summary: each plays from its moment.</div>
                  <Lines title="Sounds like something to do" lines={a.found.actions} onSeek={seek} nameOf={nameOf} owners onTask={toTask} icon={<ListTodo className="size-3.5" />} />
                  <Lines title="Dates and times said" lines={a.found.dates} onSeek={seek} nameOf={nameOf} icon={<CalendarDays className="size-3.5" />} />
                  <Lines title="Questions asked" lines={a.found.questions} onSeek={seek} nameOf={nameOf} icon={<CircleHelp className="size-3.5" />} />
                  {a.found.names.length > 0 && <div className="text-control text-muted-foreground">Names said: {a.found.names.map((one) => one.name).join(', ')}</div>}
                  {!a.found.actions.length && !a.found.dates.length && !a.found.questions.length && <div className="text-control text-muted-foreground">No actions, dates or questions were heard.</div>}
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 pt-1 text-meta text-muted-foreground"><Mic className="size-3" />What was said, by who: click a time to play from there.</div>
          </div>
      {naming && <NameVoice who={naming.who} el={naming.el} was={a.names[naming.who] ?? ''} people={a.people} onName={(as) => name(naming.who, as)} onClose={() => setNaming(null)} />}
    </NodeViewWrapper>
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

function Row({ line, onSeek, lead, who, onTask }: { line: Said; onSeek: (at: number) => void; lead?: string; who?: string; onTask?: () => void }): React.JSX.Element {
  return (
    <div className="group flex items-center">
      <button type="button" data-meeting-row onClick={() => onSeek(line.at)} className={ROW}>
        <span className="w-10 shrink-0 text-meta tabular-nums text-muted-foreground">{clock(line.at)}</span>
        {who && <span className="shrink-0 font-semibold">{who}</span>}
        <span className="min-w-0 flex-1 text-pretty">{lead ?? line.text}</span>
      </button>
      {onTask && (
        <button type="button" data-meeting-task onClick={onTask}
          className="ml-1 flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-control text-muted-foreground opacity-0 transition-[color,background-color,scale,opacity] group-hover:opacity-100 hover:bg-accent hover:text-foreground focus-visible:opacity-100 active:scale-[0.97]">
          <ListTodo className="size-3.5" />Make it a task
        </button>
      )}
    </div>
  )
}

function Lines({ title, lines, onSeek, nameOf, owners, onTask, icon }: { title: string; lines: (Said & { owner?: string })[]; onSeek: (at: number) => void; nameOf: (who?: string) => string; owners?: boolean; onTask?: (line: Said & { owner?: string }) => void; icon?: React.ReactNode }): React.JSX.Element | null {
  if (!lines.length) return null
  return (
    <Section icon={icon} title={title} count={lines.length}>
      {lines.map((line, at) => <Row key={at} line={line} onSeek={onSeek} who={owners || line.speaker ? nameOf(line.owner ?? line.speaker) : undefined} onTask={onTask && (() => void onTask(line))} />)}
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
      <PopoverContent data-meeting-naming align="start" className="w-64 gap-2 p-3">
        <div className="text-control font-semibold">Who is {was || `Speaker ${who.replace(/^s/, '')}`}?</div>
        <input autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="Their name"
          onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), onName(text))}
          className="h-7 w-full rounded-md border bg-transparent px-2 text-control outline-none focus:border-[var(--tt-brand-color-500)]" />
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
