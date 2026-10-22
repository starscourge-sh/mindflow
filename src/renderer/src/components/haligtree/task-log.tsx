import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { EASE, shift } from '@/lib/motion'

import { chime } from '@/lib/sound'
import { unloaded, useLive, haligtree, when, type Gloss, type LogEntry, type Session } from '@/lib/haligtree'
import { useReading } from '@/lib/reads-in'
import { cn } from '@/lib/cn'
import { GlossLine, useGlossKey } from './gloss-line'
import { Island, Kbd, Rolling, toast, Typed } from './ui'
import { SessionTimeline } from './session-timeline'
import { ShowMore, useShowMore } from './show-more'
import { RowMenu, copy, type MenuItem } from './row-menu'
import { reword } from './questions-view'
import { Quote as MessageSquareText, Timer } from '@/components/ui/icons'

/**
 * A task's running log: what each work session came to, and every thought
 * kept on it between sessions, newest first. The task's Notes stay what the
 * task is; the log is what happened to it, one dated row at a time, so
 * past-you is never written over.
 */

/** Time worked, the way you would say it: 25 min, 1 h 20 min. */
export const worked = (session: Session): string => {
  const minutes = Math.max(1, Math.round((new Date(session.endedAt!).getTime() - new Date(session.startedAt).getTime() - session.pausedMs) / 60000))
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`
}

/** Keep "how it went" on a session already ended, with its sound and a way back. */
export async function keepRecap(id: string, text: string, onUndo?: (words: string) => void): Promise<void> {
  const words = text.trim()
  if (!words) return
  const was = await haligtree.recapSession(id, words)
  chime('logged')
  toast('Saved in the task’s log', () => void haligtree.recapSession(id, was).then(() => onUndo?.(words)))
}

/**
 * "How did it go?", one line under a session just ended. Enter keeps it as
 * the session's recap; Escape, or leaving it empty, skips it: asked, never
 * insisted on.
 */
export function RecapLine({ id, focus = true, onDone, className, again = '', onUndone }: { id: string; focus?: boolean; onDone: () => void; className?: string; /** Words taken back with Undo, in the line again. */ again?: string; /** What was kept here was undone: the line is wanted back with these words. */ onUndone?: (words: string) => void }): React.JSX.Element {
  const [words, setWords] = useState(again)
  const field = useRef<HTMLTextAreaElement>(null)
  // Only takes the keys when this window already has them: a session ended
  // from the pill must not pull you back into a field you never chose.
  useEffect(() => void (focus && document.hasFocus() && (field.current?.focus(), field.current?.setSelectionRange(again.length, again.length))), [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  const keep = (): void => {
    if (words.trim()) void keepRecap(id, words, onUndone)
    onDone()
  }
  return (
    <motion.label
      initial={{ opacity: 0, transform: shift('translateY(-2px)') }}
      animate={{ opacity: 1, transform: shift('translateY(0px)') }}
      transition={{ duration: 0.16, ease: EASE }}
      onClick={(event) => event.stopPropagation()}
      className={cn('flex items-start gap-2 rounded-lg border bg-accent/30 px-2.5 py-1.5 text-xs focus-within:border-foreground/25', className)}
    >
      <Timer className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <textarea
        ref={field}
        rows={1}
        value={words}
        placeholder="How did it go?"
        aria-label="How did it go?"
        onChange={(event) => setWords(event.target.value)}
        onBlur={() => !words.trim() && onDone()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            keep()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            chime('fold')
            onDone()
          }
        }}
        className="max-h-24 min-w-0 flex-1 resize-none bg-transparent text-control text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground"
      />
      {words.trim() ? <Kbd className="mt-px shrink-0">↵</Kbd> : <Kbd className="mt-px shrink-0">Esc</Kbd>}
    </motion.label>
  )
}

type Entry = { key: string; at: string; text: string | null; session?: Session; gloss?: Gloss }

/**
 * The log, on the task's detail panel: sessions and thoughts in one column,
 * newest first. A session reads as time spent (a timer, how long, the day);
 * a thought as a dated note. A session that ends while the log is in view
 * asks "How did it go?" under itself, and what you type there, or in the
 * pill, types itself in here.
 */
export function TaskLog({ taskId }: { taskId: string }): React.JSX.Element {
  const sessions = useLive(() => haligtree.sessions(taskId), null as Session[] | null, [taskId])
  const glosses = useLive(() => haligtree.glosses(taskId), null as Gloss[] | null, [taskId])
  const LOG_FEW = 20
  // What each session logged from the pill while it ran: its timeline, under it.
  const logged = useLive(() => haligtree.taskSessionLog(taskId), [] as LogEntry[], [taskId])
  // The pane it is in waits for these (lib/reads-in.tsx): the "lands here" line came in a beat late and pushed the dates down.
  useReading(!sessions || !glosses || unloaded(logged))
  useGlossKey(taskId)
  const [asking, setAsking] = useState<string | null>(null)
  // A recap undone: its words, back in its line.
  const [again, setAgain] = useState('')
  useEffect(() => void (!asking && setAgain('')), [asking])

  // A session seen running and now over, with nothing said: ask, once.
  const running = useRef<string | null>(null)
  useEffect(() => {
    if (!sessions) return
    const was = running.current && sessions.find((one) => one.id === running.current)
    if (was && was.endedAt && !was.abandonedAt && !was.recap?.trim()) setAsking(was.id)
    running.current = sessions.find((one) => !one.endedAt)?.id ?? null
  }, [sessions])

  const entries: Entry[] = [
    ...(sessions ?? []).filter((one) => one.endedAt).map((one) => ({ key: `s-${one.id}`, at: one.endedAt!, text: one.recap?.trim() || null, session: one })),
    ...(glosses ?? []).map((one) => ({ key: `g-${one.id}`, at: one.createdAt, text: one.body, gloss: one }))
  ].sort((a, b) => b.at.localeCompare(a.at))
  // A long log shows its newest, and the rest a click away, so a task worked on for months opens at once.
  const few = useShowMore(entries, LOG_FEW, taskId)
  const shownEntries = few.shown

  return (
    <Island compact title={<span className="flex items-baseline gap-1.5">Log {entries.length > 0 && <Rolling text={entries.length} className="font-normal text-muted-foreground tabular-nums" />}</span>}>
      <div className="px-2 py-1.5">
        <GlossLine id={taskId} latest={false} placeholder="Where it stands, what you tried, what is next" />
      </div>
      {sessions && glosses && !entries.length && (
        <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
          <Typed text="Each session's recap and each thought you add lands here, dated, newest first." />
        </p>
      )}
      <AnimatePresence initial={false}>
        {shownEntries.map((one) => {
          // Right-click, as a goal's logs and a question's clues have it: a thought can be reworded,
          // copied or removed (with Undo); a session's recap copied.
          const gloss = one.gloss
          const menu: MenuItem[] = [
            gloss && { label: 'Change the words…', run: () => void reword(gloss.id, gloss.body, 'log') },
            !!one.text && { label: 'Copy the log', run: () => copy(one.text!) },
            gloss && 'separator',
            gloss && { label: 'Remove the log', danger: true, run: () => void haligtree.cutClue(gloss.id).then((was) => (chime('away'), toast('Log removed', was ? () => void haligtree.putClue(was) : undefined))) }
          ]
          return (
          <RowMenu key={one.key} items={menu}>
          <motion.div
            layout="position"
            initial={{ opacity: 0, transform: shift('translateY(-4px)') }}
            // An abandoned session sits faint: there, but not counted.
            animate={{ opacity: one.session?.abandonedAt ? 0.55 : 1, transform: shift('translateY(0px)') }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE }}
            data-abandoned={one.session?.abandonedAt ? '' : undefined}
            className="px-2 py-1.5"
          >
            {one.text ? (
              <p className="private-text text-control whitespace-pre-line text-foreground wrap-break-word">
                {/* A row is written, never typed: it arrives by easing in (lib/motion.ts). */}
                {one.text}
              </p>
            ) : one.session && asking === one.session.id ? (
              <RecapLine id={one.session.id} onDone={() => setAsking(null)} className="-mx-1" again={again}
                onUndone={(words) => (setAgain(words), setAsking(one.session!.id))} />
            ) : one.session && !one.session.abandonedAt ? (
              <button type="button" onClick={() => (chime('tap'), setAsking(one.session!.id))} className="text-control text-muted-foreground transition-colors hover:text-foreground">
                How did it go?
              </button>
            ) : null}
            {one.session && <SessionTimeline entries={logged.filter((entry) => entry.sessionId === one.session!.id)} className="mb-1" />}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {one.session ? (
                <>
                  <Timer className="size-3 shrink-0" />
                  {/* Abandoned: kept here as it happened, counted in no total. */}
                  <span className="truncate tabular-nums">{one.session.abandonedAt ? `Abandoned after ${worked(one.session)}` : `${worked(one.session)} of focus`} · {when(one.at, false)}</span>
                </>
              ) : (
                <>
                  <MessageSquareText className="size-3 shrink-0" />
                  <span className="truncate tabular-nums">{when(one.at, false)}</span>
                  {one.gloss?.author === 'ai' && <span className="rounded border border-border/80 px-1 text-[10px] leading-4 tracking-wide uppercase">AI</span>}
                </>
              )}
            </p>
          </motion.div>
          </RowMenu>
          )
        })}
      </AnimatePresence>
      <ShowMore total={entries.length} shown={shownEntries.length} few={LOG_FEW} onMore={few.onMore} onFewer={few.onFewer} className="mx-1 mb-1" />
    </Island>
  )
}
