import { useEffect, useRef, useState } from 'react'
import { RowMenu } from './vigil/row-menu'
import { ArrowUpRight, Pencil, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'

import { shown } from './rot-cards'
import { chime } from '@/lib/sound'
import { vigil } from '@/lib/vigil'
import { Rolling, refuse, toast } from './vigil/ui'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Hint = NonNullable<Awaited<ReturnType<typeof window.api.hints.next>>>


/**
 * A hint: one nugget you did not ask for, like a tip on a game's loading
 * screen. Up and down change how often it comes back; doing nothing is the
 * normal case and says nothing. It never grades and never schedules.
 */
export function HintCard({ onOpen }: { onOpen: (type: string, id: string) => void }): React.JSX.Element | null {
  const [hint, setHint] = useState<Hint | null>(null)
  // Two bells once, when a hint arrives: not on every animation the card
  // runs afterwards, which rang them again as the page moved around it.
  useEffect(() => void (hint && chime('hint')), [hint?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const shownAt = useRef(0)
  // What the card says, set a beat after it arrives so the words roll in
  // from nothing rather than appearing already there.
  const [said, setSaid] = useState('')
  useEffect(() => {
    setSaid('')
    if (!hint) return
    const timer = setTimeout(() => setSaid(shown(hint.title, hint.body)), 120)
    return () => clearTimeout(timer)
  }, [hint?.id, hint?.title]) // eslint-disable-line react-hooks/exhaustive-deps
  // Fixing it where it stands: the words in a field, Enter keeps them.
  const [fixing, setFixing] = useState<string | null>(null)
  useEffect(() => setFixing(null), [hint?.id])
  const open = (): void => {
    if (!hint) return
    onOpen(hint.id === hint.captureId ? 'capture' : ((hint as { tier?: string }).tier ?? 'nugget'), hint.id)
    setHint(null)
  }
  // One plain paragraph can be fixed in place; anything richer opens whole,
  // so a list or a picture is never flattened into a line.
  const plain = (body: unknown): boolean => {
    const doc = body as { content?: { type?: string; content?: { type?: string }[] }[] } | null
    if (typeof body === 'string') return !body.includes('\n')
    return !!doc && (doc.content?.length ?? 0) <= 1 && (doc.content?.[0]?.type ?? 'paragraph') === 'paragraph' && (doc.content?.[0]?.content ?? []).every((one) => one.type === 'text')
  }
  const fix = (): void => {
    if (!hint) return
    if (!plain(hint.body)) return open()
    setFixing(shown(hint.title, hint.body))
  }
  const keep = (text: string): void => {
    if (!hint) return
    const words = text.trim()
    setFixing(null)
    if (!words || words === shown(hint.title, hint.body)) return
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: words }] }] }
    setHint({ ...hint, title: words, body })
    void (hint.id === hint.captureId
      ? window.api.captures.save(hint.id, { body })
      : vigil.saveItem(hint.id, { body, title: words })
    ).then(() => toast('Fixed'))
  }

  // Most opens show nothing: the rate is a setting, a tenth by default.
  useEffect(
    () =>
      window.api.onShown(async () => {
        const { rate } = await vigil.hintRate()
        setAsking(false)
        if (Math.random() < rate) {
          const next = await window.api.hints.next()
          shownAt.current = Date.now()
          setHint(next)
        } else setHint(null)
      }),
    []
  )
  // Dwell: how long it was on screen before the window went. Every hint
  // produces one, where a vote is rare, so it is the signal that says most.
  useEffect(() => {
    if (!hint) return
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') void window.api.hints.dwell(hint.event, Date.now() - shownAt.current)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [hint])

  // After an up-vote, the card asks once whether it should be tested: the
  // moment a hint stops you is the only moment you will act on it.
  const [asking, setAsking] = useState(false)
  const react = (reaction: 'up' | 'down'): void => {
    if (!hint) return
    void window.api.hints.react(hint.event, hint.id, reaction)
    if (reaction === 'up') {
      chime('promote')
      // Attention it earned is evidence: a nugget is asked for a question, an
      // old capture whether to keep it, both one line, right there.
      setAsking(true)
    } else {
      chime('away')
      setHint(null)
    }
  }
  // Ctrl-U and Ctrl-D from anywhere in the prompt, so a vote needs no mouse.
  useEffect(() => {
    if (!hint || asking) return
    const onKey = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || !event.shiftKey) return
      if (event.code === 'ArrowUp') react('up')
      else if (event.code === 'ArrowDown') react('down')
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // What a hint offers, as buttons and as its right-click menu alike.
  const actions: { icon: typeof X; tip: string; keys?: string; run: () => void }[] = !hint ? [] : [
                // Opened right here in the prompt: the capture in the box, a
                // nugget or article in its place.
                { icon: ArrowUpRight, tip: 'Open it', run: open },
                { icon: Pencil, tip: 'Fix its words', run: fix },
                { icon: ThumbsUp, tip: 'Show this more often', keys: '⌃⇧↑', run: () => react('up') },
                { icon: ThumbsDown, tip: 'Show this less often', keys: '⌃⇧↓', run: () => react('down') },
                { icon: X, tip: 'Not now', run: () => setHint(null) },
                // Gone for good, but never destroyed: a capture goes to
                // Discarded and a nugget stops surfacing; both come back.
                { icon: Trash2, tip: hint.id === hint.captureId ? 'Discard it' : 'Stop showing it', run: () => {
                  const id = hint.id
                  const capture = id === hint.captureId
                  chime('away')
                  setHint(null)
                  void (capture ? window.api.captures.save(id, { status: 'discarded' }) : vigil.saveItem(id, { suspended: true })).then(() =>
                    toast(capture ? 'Discarded: it is in Discarded if you want it back' : 'It will not come up again', () =>
                      void (capture ? window.api.captures.save(id, { status: 'open' }) : vigil.saveItem(id, { suspended: false }))))
                } }
]
  return (
    <AnimatePresence>
      {hint && (
        <motion.div
          key={hint.id}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.2 } }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="mt-2 mb-3 overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--tt-brand-color-400)_22%,transparent)] bg-[color-mix(in_srgb,var(--tt-brand-color-400)_10%,transparent)] px-3 py-2.5 text-sm"
        >
          <RowMenu items={actions.map(({ tip, keys, run }) => ({ label: tip, keys, run, danger: tip === 'Discard it' }))}>
            {fixing !== null ? (
              // Grows with the words and sits where they sat, so a two-line hint
              // stays two lines and the card does not jump.
              <textarea
                autoFocus
                rows={1}
                value={fixing}
                onChange={(event) => setFixing(event.target.value)}
                onBlur={() => keep(fixing)}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    keep(fixing)
                  }
                  // Closes the field only, never the window behind it.
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setFixing(null)
                  }
                }}
                className="block w-full resize-none bg-transparent outline-none [field-sizing:content]"
              />
            ) : (
              <div className="line-clamp-6 cursor-text whitespace-pre-line" onClick={fix}>
                {/* The words roll in when it arrives, a hint being dealt; a
                    long one, which must wrap, simply appears, since rolling
                    text keeps to one line. */}
                {said.length <= 40 && !said.includes('\n') ? <Rolling by="word" text={said} /> : said}
              </div>
            )}
          </RowMenu>
          {asking ? (
            <Input
              autoFocus
              placeholder={hint.id === hint.captureId ? 'Keep it? Say why in a line and press Enter' : 'Worth testing? Write the question and press Enter'}
              onBlur={() => setHint(null)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  return setHint(null)
                }
                if (event.key !== 'Enter' || !event.currentTarget.value.trim()) return
                const line = event.currentTarget.value.trim()
                void (hint.id === hint.captureId
                  ? vigil.promote(hint.id, line).then((result) => (result === 'needs-source' ? refuse('A quote needs to say who said it first') : toast('Kept as a nugget, with your line beside it')))
                  : vigil.saveItem(hint.id, { prompt: line }).then(() => toast('Now tested: it joins your review'))
                ).then(() => setHint(null))
              }}
              className="mt-2 w-full h-8"
            />
          ) : (
            <div className="mt-2 flex items-center gap-1 text-muted-foreground [&_svg]:size-3.5">
              <span className="mr-auto text-xs">Hint · {hint.kind}</span>
              {/* Open, or let it go: a hint asks nothing else of you. Each
                  button says what it does, since the icons alone do not. */}
              {actions.map(({ icon: Icon, tip, keys, run }) => (
                <Tooltip key={tip}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={tip} onClick={run}>
                      <Icon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {tip}
                    {keys && <kbd className="ml-2 font-sans text-key opacity-70">{keys}</kbd>}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
