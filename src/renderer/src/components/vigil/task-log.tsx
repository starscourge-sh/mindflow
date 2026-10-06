import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MessageSquareText, Timer } from 'lucide-react'

import { chime } from '@/lib/sound'
import { useLive, vigil, when, type Gloss, type Session } from '@/lib/vigil'
import { cn } from '@/lib/cn'
import { GlossLine, useGlossKey } from './gloss-line'
import { Island, Kbd, Rolling, toast, Typed } from './ui'

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
export async function keepRecap(id: string, text: string): Promise<void> {
  const words = text.trim()
  if (!words) return
  const was = await vigil.recapSession(id, words)
  chime('logged')
  toast('Kept in the task’s log', () => void vigil.recapSession(id, was))
}

/**
 * "How did it go?", one line under a session just ended. Enter keeps it as
 * the session's recap; Escape, or leaving it empty, skips it: asked, never
 * insisted on.
 */
export function RecapLine({ id, focus = true, onDone, className }: { id: string; focus?: boolean; onDone: () => void; className?: string }): React.JSX.Element {
  const [words, setWords] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  // Only takes the keys when this window already has them: a session ended
  // from the pill must not pull you back into a field you never chose.
  useEffect(() => void (focus && document.hasFocus() && field.current?.focus()), [focus])
  const keep = (): void => {
    if (words.trim()) void keepRecap(id, words)
    onDone()
  }
  return (
    <motion.label
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
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
  const sessions = useLive(() => vigil.sessions(taskId), null as Session[] | null, [taskId])
  const glosses = useLive(() => vigil.glosses(taskId), null as Gloss[] | null, [taskId])
  useGlossKey(taskId)
  const [asking, setAsking] = useState<string | null>(null)

  // A session seen running and now over, with nothing said: ask, once.
  const running = useRef<string | null>(null)
  useEffect(() => {
    if (!sessions) return
    const was = running.current && sessions.find((one) => one.id === running.current)
    if (was && was.endedAt && !was.recap?.trim()) setAsking(was.id)
    running.current = sessions.find((one) => !one.endedAt)?.id ?? null
  }, [sessions])

  const entries: Entry[] = [
    ...(sessions ?? []).filter((one) => one.endedAt).map((one) => ({ key: `s-${one.id}`, at: one.endedAt!, text: one.recap?.trim() || null, session: one })),
    ...(glosses ?? []).map((one) => ({ key: `g-${one.id}`, at: one.createdAt, text: one.body, gloss: one }))
  ].sort((a, b) => b.at.localeCompare(a.at))

  // Typed only for words that arrive while you watch: a recap kept from the
  // pill, a thought just written. What was already here reads still.
  const seen = useRef<Map<string, string | null> | null>(null)
  const fresh = useRef(new Set<string>())
  if (sessions && glosses) {
    if (seen.current) for (const one of entries) if (one.text && seen.current.get(one.key) !== one.text) fresh.current.add(`${one.key}:${one.text}`)
    seen.current = new Map(entries.map((one) => [one.key, one.text]))
  }

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
        {entries.map((one) => (
          <motion.div
            key={one.key}
            layout="position"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="px-2 py-1.5"
          >
            {one.text ? (
              <p className="private-text text-control whitespace-pre-line text-foreground wrap-break-word">
                {fresh.current.has(`${one.key}:${one.text}`) ? <Typed text={one.text} step={28} delay={60} /> : one.text}
              </p>
            ) : one.session && asking === one.session.id ? (
              <RecapLine id={one.session.id} onDone={() => setAsking(null)} className="-mx-1" />
            ) : one.session ? (
              <button type="button" onClick={() => (chime('tap'), setAsking(one.session!.id))} className="text-control text-muted-foreground transition-colors hover:text-foreground">
                How did it go?
              </button>
            ) : null}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              {one.session ? (
                <>
                  <Timer className="size-3 shrink-0" />
                  <span className="truncate tabular-nums">{worked(one.session)} of focus · {when(one.at, false)}</span>
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
        ))}
      </AnimatePresence>
    </Island>
  )
}
