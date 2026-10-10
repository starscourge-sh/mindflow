import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { Bell, BellOff, Check, ChevronRight, Eye, FileText, Folder, Lock, Pause, Repeat, Star, Unlock } from 'lucide-react'
import { EASE, spring } from '@/lib/motion'
import { timerFrom } from '@/lib/timer'
import { clock } from './focus-pill'
import { Flip } from './review-view'
import { ProgressBar } from './progress-bar'
import { Struck } from './marks'
import { Tape } from './tape'
import { Kbd, Rolling } from './ui'

/**
 * The small moving pictures on the What Vigil can do page, one per power, by
 * its id (lib/powers.ts). Each is the real thing in miniature, fed example
 * words: the box's own tag colours, the focus pill's clock, Review's card
 * that turns over, the bars and pen marks the app draws. Each plays as a few
 * steps on a loop while it is on screen (`live`); off screen, or with Motion
 * off or Reduce motion, it holds still on its last step, which shows what the
 * power gives you.
 */
type Demo = (props: { live: boolean }) => React.JSX.Element

/** Which step of a loop of `ms` long steps is showing; `rest` while not live. */
function useSteps(ms: number[], live: boolean, rest = ms.length - 1): number {
  const [at, setAt] = useState(rest)
  useEffect(() => {
    if (!live) return setAt(rest)
    let step = 0
    let timer: ReturnType<typeof setTimeout>
    setAt(0)
    const next = (): void => {
      timer = setTimeout(() => {
        step = (step + 1) % ms.length
        setAt(step)
        next()
      }, ms[step])
    }
    next()
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])
  return at
}

/** Words typed in a letter at a time while `typing`; whole otherwise. */
function useTyped(text: string, typing: boolean, speed = 42): string {
  const [n, setN] = useState(text.length)
  useEffect(() => {
    if (!typing) return setN(text.length)
    setN(0)
    const timer = setInterval(() => setN((at) => (at >= text.length ? (clearInterval(timer), at) : at + 1)), speed)
    return () => clearInterval(timer)
  }, [typing, text, speed])
  return text.slice(0, n)
}
/** How long typing `text` takes, and a beat after. */
const typeMs = (text: string, speed = 42): number => text.length * speed + 650

const TONE: Record<string, string> = { tag: 'red', plus: 'purple', bang: 'orange', time: 'blue', embed: 'green' }
/** The box's words, with the parts it acts on tinted the way the box tints them. */
function Said({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(#[\w-]+|![a-z]+|^\+[^:]+:|\b\d+m\b|!\[\[[^\]]*\]?\]?)/g).filter(Boolean)
  return <>{parts.map((part, i) => {
    const kind = part.startsWith('#') ? 'tag' : part.startsWith('![[') ? 'embed' : part.startsWith('!') ? 'bang' : part.startsWith('+') ? 'plus' : /^\d+m$/.test(part) ? 'time' : null
    return kind ? <span key={i} className="tiptap-token" data-token-color={TONE[kind]}>{part}</span> : <span key={i}>{part}</span>
  })}</>
}
const Caret = ({ on = true }: { on?: boolean }): React.JSX.Element => <span aria-hidden className={`pw-caret ${on ? '' : 'opacity-0'}`} />

/** The box, small: its rounded card and its words. */
function Box({ text, caret = true, className = '', children }: { text: string; caret?: boolean; className?: string; children?: ReactNode }): React.JSX.Element {
  return (
    <div className={`w-full max-w-[17rem] rounded-xl border bg-popover px-3 py-2 text-control leading-snug text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08),0_6px_16px_-6px_rgb(0_0_0/0.18)] ${className}`}>
      {text ? <Said text={text} /> : <span className="text-muted-foreground">Write anything…</span>}<Caret on={caret} />
      {children}
    </div>
  )
}

const Dot = ({ on, tint = 'var(--primary)' }: { on: boolean; tint?: string }): React.JSX.Element => (
  <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200" style={on ? { background: tint, borderColor: tint } : { borderColor: 'color-mix(in oklab, var(--foreground) 28%, transparent)' }}>
    {on && <Check className="size-2.5 text-primary-foreground" strokeWidth={3.5} />}
  </span>
)
const Row = ({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }): React.JSX.Element => (
  <div className={`flex h-7 items-center gap-2 rounded-md px-2 text-control text-foreground ${className}`} style={style}>{children}</div>
)
const Chip = ({ children, tint, className = '' }: { children: ReactNode; tint?: string; className?: string }): React.JSX.Element => (
  <span className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-meta whitespace-nowrap ${className}`}
    style={{ background: tint ? `var(--tt-color-highlight-${tint})` : 'color-mix(in oklab, var(--foreground) 7%, transparent)', color: tint ? `var(--tt-color-text-${tint})` : 'var(--muted-foreground)' }}>{children}</span>
)
const Line = ({ w, className = '' }: { w: string; className?: string }): React.JSX.Element => <span className={`block h-1.5 rounded-full bg-foreground/12 ${className}`} style={{ width: w }} />
const rise = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.32, ease: EASE } }
const Col = ({ children, className = '' }: { children: ReactNode; className?: string }): React.JSX.Element => <div className={`flex w-full max-w-[17rem] flex-col gap-2 ${className}`}>{children}</div>

/** A pointer, drawn: where the demo's hand is. */
function Pointer({ x, y, press = false }: { x: number | string; y: number | string; press?: boolean }): React.JSX.Element {
  return (
    <motion.svg aria-hidden width="14" height="18" viewBox="0 0 14 18" className="pointer-events-none absolute z-10 drop-shadow-[0_1px_1px_rgb(0_0_0/0.3)]"
      initial={false} animate={{ left: x, top: y, scale: press ? 0.88 : 1 }} transition={{ duration: 0.6, ease: EASE }}>
      <path d="M1 1v14l3.6-3.4 2.6 5.6 2.2-1-2.6-5.4H12z" fill="var(--foreground)" stroke="var(--background)" strokeWidth="1.2" strokeLinejoin="round" />
    </motion.svg>
  )
}

// ---------------------------------------------------------------- Catching

const BOX_NOTE = 'Call Mum about Sunday'
const BoxDemo: Demo = ({ live }) => {
  const at = useSteps([700, typeMs(BOX_NOTE), 900, 1600], live, 3)
  const text = useTyped(BOX_NOTE, at === 1)
  return (
    <div className="relative h-[8.5rem] w-full max-w-[17rem]">
      {/* Whatever app you were in, faint under the box: a page of someone else's words. */}
      <div aria-hidden className="absolute inset-0 overflow-hidden rounded-lg border bg-foreground/[0.025]">
        <div className="flex h-5 items-center gap-1 border-b px-2">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-foreground/15" />)}<span className="ml-2 h-1.5 w-16 rounded-full bg-foreground/10" /></div>
        <div className="flex flex-col gap-2 p-3"><Line w="72%" /><Line w="90%" /><Line w="84%" /><Line w="60%" /><Line w="78%" /><Line w="44%" /></div>
      </div>
      <AnimatePresence>
        {(at === 1 || at === 2) && (
          <motion.div key="box" className="absolute inset-x-4 top-9" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={spring.slow}>
            <Box text={at === 2 ? BOX_NOTE : text} caret={at === 1} />
          </motion.div>
        )}
        {at === 3 && (
          <motion.div key="kept" {...rise} className="absolute inset-x-0 top-12 flex justify-center">
            <Chip tint="green"><Check className="size-3" strokeWidth={3} /> Sent to your Inbox</Chip>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const TIMER = '5m tea'
const TimerDemo: Demo = ({ live }) => {
  const at = useSteps([typeMs(TIMER, 90), 4200, 400], live, 1)
  const text = useTyped(TIMER, at === 0, 90)
  const set = timerFrom(TIMER)!
  const [gone, setGone] = useState(0)
  useEffect(() => {
    setGone(live ? 0 : 3000)
    if (at !== 1 || !live) return
    const timer = setInterval(() => setGone((ms) => ms + 1000), 1000)
    return () => clearInterval(timer)
  }, [at, live])
  const share = gone / set.ms
  return (
    <Col className="items-center">
      <Box text={at === 0 ? text : TIMER} caret={at === 0} className={`transition-opacity duration-300 ${at === 0 ? '' : 'opacity-40'}`} />
      <div className="h-10">
        <AnimatePresence>
          {at === 1 && (
            <motion.div {...rise} className="flex h-10 items-center gap-2.5 rounded-full border bg-popover pr-3.5 pl-2 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.25)]">
              <svg viewBox="0 0 24 24" className="size-6 -rotate-90">
                <circle cx="12" cy="12" r="9" fill="none" stroke="color-mix(in oklab, var(--foreground) 12%, transparent)" strokeWidth="2.5" />
                <circle cx="12" cy="12" r="9" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={56.5} strokeDashoffset={56.5 * (1 - share)} style={{ transition: 'stroke-dashoffset 900ms linear' }} />
              </svg>
              <span className="text-control text-foreground">{set.goal}</span>
              <span className="text-control font-medium tabular-nums text-foreground">{clock(set.ms - gone)}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Col>
  )
}

const CLUE = '+Who is the monster?: the creature reads Paradise Lost'
const ClueDemo: Demo = ({ live }) => {
  const at = useSteps([typeMs(CLUE, 34), 2600, 300], live, 1)
  const text = useTyped(CLUE, at === 0, 34)
  return (
    <Col>
      <Box text={at === 0 ? text : CLUE} caret={at === 0}>
        <div className={`mt-1 text-meta text-muted-foreground transition-opacity duration-300 ${at === 0 && text.includes(':') ? 'opacity-100' : at === 0 ? 'opacity-0' : 'opacity-60'}`}>A clue for “Who is the monster?”</div>
      </Box>
      <div className="rounded-lg border bg-background px-3 py-2">
        <div className="flex items-center gap-2 text-control text-foreground"><span className="text-muted-foreground">?</span><span className="flex-1 truncate">Who is the monster?</span>
          <span className="text-meta text-muted-foreground tabular-nums"><Rolling text={at === 1 ? 3 : 2} /> clues</span></div>
        <AnimatePresence initial={false}>
          {at === 1 && <motion.div key="clue" {...rise} className="mt-1 truncate pl-4 text-meta text-muted-foreground">“The creature reads Paradise Lost”</motion.div>}
        </AnimatePresence>
      </div>
    </Col>
  )
}

const BUG = 'Login button does nothing #bug'
const TagTaskDemo: Demo = ({ live }) => {
  const at = useSteps([typeMs(BUG), 2600, 300], live, 1)
  const text = useTyped(BUG, at === 0)
  return (
    <Col>
      <Box text={at === 0 ? text : BUG} caret={at === 0} className={`transition-opacity duration-300 ${at === 0 ? '' : 'opacity-40'}`} />
      <div className="rounded-lg border bg-background py-1">
        <div className="px-2 pb-0.5 text-meta text-muted-foreground">Today</div>
        <AnimatePresence initial={false}>
          {at === 1 && (
            <motion.div key="new" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 28 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.36, ease: EASE }}>
              <Row><Dot on={false} /><span className="flex-1 truncate">Login button does nothing</span><Chip tint="red">#bug</Chip></Row>
            </motion.div>
          )}
        </AnimatePresence>
        <Row className="text-muted-foreground"><Dot on={false} /><span className="truncate">Water the plants</span></Row>
      </div>
    </Col>
  )
}

const MODES = [
  { said: '!alert', label: 'Interrupts you', icon: Bell, tint: 'orange' },
  { said: '!quiet', label: 'Counted in the menu bar', icon: BellOff, tint: 'blue' },
  { said: '!pull', label: 'Only when you look', icon: Eye, tint: 'gray' }
] as const
const RemindDemo: Demo = ({ live }) => {
  const words = MODES.map((mode) => `Call the dentist at 9 ${mode.said}`)
  const at = useSteps(words.flatMap((one) => [typeMs(one, 36), 1500]), live, 1)
  const mode = MODES[Math.floor(at / 2)]
  const text = useTyped(words[Math.floor(at / 2)], at % 2 === 0, 36)
  return (
    <Col>
      <Box text={at % 2 === 0 ? text : words[Math.floor(at / 2)]} caret={at % 2 === 0} />
      <div className="flex h-6 items-center gap-1.5 px-1">
        <AnimatePresence mode="popLayout">
          {at % 2 === 1 && (
            <motion.span key={mode.said} {...rise} className="flex items-center gap-1.5">
              <Chip>Tomorrow 9:00</Chip>
              <Chip tint={mode.tint}><mode.icon className="size-3" /> {mode.label}</Chip>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </Col>
  )
}

const SAME = ['Walk after lunch', 'A lunch walk helps', 'Walking clears my head']
const ComingBackDemo: Demo = ({ live }) => {
  const at = useSteps([1400, 700, 2600], live, 2)
  return (
    <div className="relative h-[7.5rem] w-full max-w-[17rem]">
      {SAME.map((text, i) => (
        <motion.div key={text} className="absolute inset-x-0 rounded-lg border bg-background" initial={false}
          animate={at === 0 ? { top: i * 38, opacity: 1, scale: 1 } : { top: 22 + i * 4, opacity: at === 2 ? 0 : 1 - i * 0.2, scale: 1 - (2 - i) * 0.03 }}
          transition={{ duration: 0.5, ease: EASE, delay: at === 1 ? i * 0.06 : 0 }}>
          <Row><span className="truncate text-muted-foreground">{text}</span><span className="ml-auto text-meta text-muted-foreground">{['3 weeks ago', 'last week', 'today'][i]}</span></Row>
        </motion.div>
      ))}
      <AnimatePresence>
        {at === 2 && (
          <motion.div key="card" className="absolute inset-x-0 top-3 rounded-xl border bg-popover px-3 py-2.5 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.25)]" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={spring.slow}>
            <div className="flex items-center gap-1.5 text-meta" style={{ color: 'var(--tt-color-text-orange)' }}><Repeat className="size-3" /> You keep coming back to this</div>
            <div className="mt-1 text-control text-foreground">Walk after lunch</div>
            <div className="mt-1 flex items-center gap-1 text-meta text-muted-foreground">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full" style={{ background: 'var(--tt-color-text-orange)' }} />)} 3×</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const PICKS = ['Look up train times', 'Ask Sam about Lisbon', 'Hotel near the river?']
const OneTaskDemo: Demo = ({ live }) => {
  const at = useSteps([600, 500, 500, 900, 2600], live, 4)
  const one = at === 4
  return (
    <Col>
      <div className="rounded-lg border bg-background py-1">
        <AnimatePresence initial={false} mode="popLayout">
          {!one ? PICKS.map((text, i) => (
            <motion.div key={text} layout exit={{ opacity: 0, y: -6 * (i + 1) }} transition={{ duration: 0.3, ease: EASE }}>
              <Row className={at > i ? 'bg-[color-mix(in_oklab,var(--primary)_12%,transparent)]' : ''}><Dot on={at > i} /><span className="truncate">{text}</span></Row>
            </motion.div>
          )) : (
            <motion.div key="task" layout {...rise}>
              <Row><Dot on={false} tint="var(--tt-color-text-green)" /><span className="flex-1 truncate">Plan the Lisbon trip</span><Chip>from 3 notes</Chip></Row>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className={`flex items-center gap-1.5 px-1 text-meta text-muted-foreground transition-opacity duration-300 ${at === 3 ? 'opacity-100' : 'opacity-0'}`}>
        Make one task from the 3 selected
      </div>
    </Col>
  )
}

const MergeDemo: Demo = ({ live }) => {
  const at = useSteps([1200, 2800], live, 1)
  return (
    <Col>
      <LayoutGroup>
        <motion.div layout className="rounded-lg border bg-background px-2.5 py-1.5" transition={{ duration: 0.4, ease: EASE }}>
          <motion.div layout="position" className="flex items-center gap-2 text-control text-foreground"><span className="text-meta text-muted-foreground tabular-nums">MF-12</span>Ideas for the garden</motion.div>
          <AnimatePresence>
            {at === 1 && <motion.div key="joined" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, ease: EASE }}
              className="mt-1 border-t border-dashed pt-1 text-meta text-muted-foreground">Raised beds along the fence</motion.div>}
          </AnimatePresence>
        </motion.div>
        <AnimatePresence>
          {at === 0 && (
            <motion.div key="other" layout exit={{ opacity: 0, y: -26, scale: 0.96 }} transition={{ duration: 0.4, ease: EASE }} className="rounded-lg border bg-background px-2.5 py-1.5 text-control text-foreground">
              <span className="mr-2 text-meta text-muted-foreground tabular-nums">MF-15</span>Raised beds along the fence
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
      <div className={`px-1 text-meta text-muted-foreground transition-opacity duration-300 ${at === 1 ? 'opacity-100' : 'opacity-0'}`}>Merged into MF-12. Both sets of words kept.</div>
    </Col>
  )
}

// ---------------------------------------------------------------- Writing

const LISTS = [
  { head: 'To do', cards: ['Book flights', 'Pack'] },
  { head: 'Doing', cards: ['Pick a route'] },
  { head: 'Done', cards: ['Ask for time off'] }
]
const BoardDemo: Demo = ({ live }) => {
  const at = useSteps([1600, 2600], live, 1)
  const board = at === 1
  // The note gives way to its board in place: one fades and settles as the other leaves, so nothing travels past the card's edge.
  return (
    <div className="grid w-full max-w-[19rem] place-items-center">
      <AnimatePresence initial={false}>
        <motion.div key={board ? 'board' : 'note'} className={`[grid-area:1/1] w-full ${board ? 'grid grid-cols-3 gap-1.5' : 'flex flex-col gap-0.5 px-2'}`}
          initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.4, ease: EASE }}>
          {LISTS.map((list) => (
            <div key={list.head} className={board ? 'flex flex-col gap-1 rounded-lg bg-foreground/[0.05] p-1.5' : 'flex flex-col'}>
              <div className={board ? 'text-meta font-medium text-muted-foreground' : 'font-heading text-control font-semibold text-foreground'}>{list.head}</div>
              {list.cards.map((card) => (
                <div key={card} className={board ? 'rounded-md border bg-background px-1.5 py-1 text-meta leading-tight text-foreground shadow-[0_1px_1px_rgb(0_0_0/0.06)]' : 'pl-3 text-meta text-muted-foreground before:mr-1.5 before:content-["•"]'}>{card}</div>
              ))}
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

const VERSIONS = [
  { when: 'Now', text: 'The garden needs a path, raised beds and somewhere to sit.' },
  { when: 'Yesterday', text: 'The garden needs a path and raised beds.' },
  { when: '3 days ago', text: 'Garden: a path?' }
]
const VersionsDemo: Demo = ({ live }) => {
  const at = useSteps([1300, 1300, 1800, 900], live, 2)
  const v = at === 3 ? 0 : at
  return (
    <Col>
      <div className="relative h-12 rounded-lg border bg-background px-3 py-2">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p key={v} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="text-meta leading-snug text-foreground">{VERSIONS[v].text}</motion.p>
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3 px-1">
        <div className="relative h-1 flex-1 rounded-full bg-foreground/12">
          {[0, 1, 2].map((i) => <span key={i} className="absolute top-1/2 size-1 -translate-1/2 rounded-full bg-foreground/30" style={{ left: `${100 - i * 50}%` }} />)}
          <motion.span className="absolute top-1/2 size-3.5 -translate-1/2 rounded-full border bg-background shadow-[0_1px_3px_rgb(0_0_0/0.3)]" initial={false} animate={{ left: `${100 - v * 50}%` }} transition={{ duration: 0.5, ease: EASE }} />
        </div>
        <span className="w-16 text-right text-meta text-muted-foreground"><Rolling text={VERSIONS[v].when} by="word" /></span>
      </div>
    </Col>
  )
}

const FIND = ['The ', 'fox', ' saw another ', 'fox', ' by the ', 'fox', ' den.']
const FindDemo: Demo = ({ live }) => {
  const at = useSteps([1100, 600, 600, 600, 1800], live, 4)
  const done = Math.max(0, at - 1)
  let n = 0
  return (
    <Col>
      <div className="flex items-center gap-1.5 rounded-lg border bg-popover px-2 py-1 text-meta shadow-sm">
        <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-foreground">fox</span>
        <span className="text-muted-foreground">→</span>
        <span className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-foreground">wolf</span>
        <span className="ml-auto tabular-nums text-muted-foreground"><Rolling text={3 - Math.min(3, done)} /> left</span>
      </div>
      <p className="rounded-lg border bg-background px-3 py-2 text-control text-foreground">
        {FIND.map((part, i) => {
          if (part !== 'fox') return <span key={i}>{part}</span>
          const mine = n++
          const changed = mine < done
          return <span key={i} className="rounded-[3px] px-px transition-colors duration-300" style={{ background: at === 0 ? 'transparent' : changed ? 'var(--tt-color-highlight-green)' : 'var(--tt-color-highlight-yellow)' }}>{changed ? 'wolf' : 'fox'}</span>
        })}
      </p>
    </Col>
  )
}

const AliasesDemo: Demo = ({ live }) => {
  const at = useSteps([700, 700, 900, 2400], live, 3)
  return (
    <Col>
      <div className="rounded-lg border bg-background px-3 py-2">
        <div className="font-heading text-control font-semibold text-foreground">Samwise Gamgee</div>
        <div className="mt-1 flex h-5 items-center gap-1 text-meta text-muted-foreground">Also called
          <AnimatePresence>{at >= 1 && <motion.span key="a" {...rise}><Chip tint="purple">Sam</Chip></motion.span>}{at >= 2 && <motion.span key="b" {...rise}><Chip tint="purple">Sam G.</Chip></motion.span>}</AnimatePresence>
        </div>
      </div>
      <p className="flex items-center gap-1.5 px-1 text-control text-muted-foreground"><Kbd>⌘K</Kbd> Sam <span className={`ml-auto transition-colors duration-300 ${at === 3 ? 'text-foreground' : 'opacity-0'}`}>Samwise Gamgee</span></p>
    </Col>
  )
}

const SUM = 'Trip: 420 + 3 × 95 ='
const CalcDemo: Demo = ({ live }) => {
  const at = useSteps([typeMs(SUM, 55), 1300, 2000], live, 2)
  const text = useTyped(SUM, at === 0, 55)
  return (
    <Col className="items-center">
      <p className="w-full rounded-lg border bg-background px-3 py-2.5 text-control text-foreground tabular-nums">
        {at === 0 ? text : SUM}
        {at >= 1 && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={at === 1 ? 'text-muted-foreground/70' : 'text-foreground'}> 705</motion.span>}
        <Caret on={at !== 2} />
      </p>
      <span className={`flex items-center gap-1.5 text-meta text-muted-foreground transition-opacity duration-300 ${at === 1 ? 'opacity-100' : 'opacity-0'}`}><Kbd>Tab</Kbd> keeps it</span>
    </Col>
  )
}

const FoldDemo: Demo = ({ live }) => {
  const at = useSteps([1500, 2200], live, 1)
  const shut = at === 1
  return (
    <Col>
      <div className="rounded-lg border bg-background px-3 py-2">
        <div className="flex items-center gap-1 font-heading text-control font-semibold text-foreground">
          <ChevronRight className={`size-3.5 text-muted-foreground transition-transform duration-300 ${shut ? '' : 'rotate-90'}`} />Trip ideas
          {shut && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ml-1 font-sans text-meta font-normal text-muted-foreground">3 lines</motion.span>}
        </div>
        <motion.div initial={false} animate={{ height: shut ? 0 : 'auto', opacity: shut ? 0 : 1 }} transition={{ duration: 0.36, ease: EASE }} className="overflow-hidden">
          <div className="flex flex-col gap-1.5 pt-1.5 pl-5"><Line w="80%" /><Line w="65%" /><Line w="72%" /></div>
        </motion.div>
        <div className="mt-2 font-heading text-control font-semibold text-foreground">Packing</div>
      </div>
    </Col>
  )
}

const BitDemo: Demo = ({ live }) => {
  const at = useSteps([1300, 1700, 900], live, 0)
  const near = at === 1
  return (
    <div className="relative w-full max-w-[17rem]">
      <div className="rounded-lg border bg-background py-1">
        <Row className="text-muted-foreground"><span className="truncate">Ideas for the garden</span></Row>
        <Row><span className={`truncate transition-[filter] duration-300 ${near ? '' : 'blur-[4px]'}`}>What I really think of the plan</span><Chip tint="red" className="ml-auto">#bit</Chip></Row>
        <Row className="text-muted-foreground"><span className="truncate">Raised beds</span></Row>
      </div>
      <Pointer x={near ? 90 : 210} y={near ? 40 : 96} />
    </div>
  )
}

const GlossaryDemo: Demo = ({ live }) => {
  const at = useSteps([1600, 2400], live, 1)
  return (
    <Col>
      <div className="rounded-xl border bg-background px-3 py-2.5">
        <div className="text-meta text-muted-foreground">Word</div>
        <div className="text-control text-foreground">What does petrichor mean?</div>
        <motion.div initial={false} animate={{ height: at === 1 ? 'auto' : 0, opacity: at === 1 ? 1 : 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
          <div className="pt-1.5 text-meta text-muted-foreground">The smell of rain on dry earth.</div>
        </motion.div>
      </div>
    </Col>
  )
}

// ---------------------------------------------------------------- Remembering

const GRADES = ['Again', 'Hard', 'Good', 'Easy']
const ReviewDemo: Demo = ({ live }) => {
  const at = useSteps([1400, 1100, 2000], live, 2)
  return (
    <Col>
      <div className="rounded-xl border bg-background px-3 py-2.5">
        <div className="text-control text-foreground">What is a Schwarzschild radius?</div>
        <motion.div initial={false} animate={{ height: at >= 1 ? 'auto' : 0, opacity: at >= 1 ? 1 : 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
          <div className="pt-1.5 text-meta text-muted-foreground">How small a mass must be squeezed to become a black hole.</div>
        </motion.div>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {GRADES.map((grade) => (
          <span key={grade} className={`flex flex-col items-center rounded-md border py-1 text-meta transition-colors duration-200 ${at === 2 && grade === 'Good' ? 'border-transparent bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            {grade}<span className="text-[0.625rem] opacity-70">{({ Again: '1m', Hard: '2d', Good: '4d', Easy: '9d' } as Record<string, string>)[grade]}</span>
          </span>
        ))}
      </div>
    </Col>
  )
}

const ClozeDemo: Demo = ({ live }) => {
  const at = useSteps([1800, 2200], live, 1)
  const face = 'flex h-20 flex-col justify-center rounded-xl border bg-background px-3.5 text-control text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06)]'
  return (
    <Col>
      <Flip over={at === 1} onTurn={() => {}}
        front={<div className={face}><span>The Rosetta Stone was found in <span className="whitespace-nowrap"><span className="mx-0.5 inline-block w-10 border-b-2 border-foreground/40 align-baseline">&nbsp;</span>.</span></span><span className="mt-1 text-meta text-muted-foreground">Fill in the blank</span></div>}
        back={<div className={face}><span>The Rosetta Stone was found in <span className="rounded bg-[var(--tt-color-highlight-green)] px-1">1799</span>.</span><span className="mt-1 text-meta text-muted-foreground">By French soldiers in Egypt</span></div>} />
    </Col>
  )
}

const WHY = { context: 'Deep Work, Cal Newport', why: 'Willpower fades by dusk' }
const ContextDemo: Demo = ({ live }) => {
  const at = useSteps([500, typeMs(WHY.context, 30), typeMs(WHY.why, 30), 1800], live, 3)
  const context = useTyped(WHY.context, at === 1, 30)
  const why = useTyped(WHY.why, at === 2, 30)
  return (
    <Col>
      <div className="rounded-lg border bg-background px-3 py-2">
        <div className="text-control text-foreground">Do the hard thing first</div>
        <div className="mt-2 grid grid-cols-[3.75rem_1fr] gap-x-2 gap-y-1 text-meta">
          <span className="text-muted-foreground">Context</span><span className="truncate text-foreground">{at === 0 ? '' : at === 1 ? context : WHY.context}{at === 1 && <Caret />}</span>
          <span className="text-muted-foreground">Why</span><span className="truncate text-foreground">{at < 2 ? '' : at === 2 ? why : WHY.why}{at === 2 && <Caret />}</span>
        </div>
      </div>
    </Col>
  )
}

const PAGES = ['Pale Blue Dot, Voyager 1, 1990', 'Never interrupt your enemy', 'Red pill or blue pill?', 'Kessel Run maths']
const ReadThroughDemo: Demo = ({ live }) => {
  const at = useSteps([1300, 1300, 1300, 1300], live, 0)
  return (
    <div className="flex w-full max-w-[17rem] flex-col items-center gap-2">
      <div className="relative h-20 w-full">
        {[2, 1, 0].map((depth) => {
          const index = (at + depth) % PAGES.length
          return (
            <motion.div key={index} className="absolute inset-0 flex items-center rounded-xl border bg-background px-4 font-heading text-body text-foreground" initial={false}
              animate={{ y: depth * 6, scale: 1 - depth * 0.05, opacity: depth === 0 ? 1 : 0.5 - depth * 0.15, zIndex: 3 - depth }}
              exit={{ x: -40, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }}>
              {depth === 0 ? PAGES[index] : ''}
            </motion.div>
          )
        })}
      </div>
      <span className="mt-2 text-meta text-muted-foreground tabular-nums"><Rolling text={at + 1} /> of 12</span>
    </div>
  )
}

// Short enough to fit beside Play next, four rows short enough to fit the stage.
const QUEUED = ['Pale Blue Dot', 'Dorian Gray', "Lovelace's Note G", 'The Kessel Run']
const QueueDemo: Demo = ({ live }) => {
  // Play next lifts the last one to the top; then each is read and the next comes up.
  const at = useSteps([1300, 1100, 1100, 1100, 1600], live, 4)
  const order = at === 0 ? QUEUED : [QUEUED[3], ...QUEUED.slice(0, 3)]
  const read = Math.max(0, at - 1)
  return (
    <Col>
      <div className="flex items-center justify-between px-1 text-meta text-muted-foreground"><span>Up next</span><span className="tabular-nums"><Rolling text={read} /> of 4 read</span></div>
      <LayoutGroup>
        <div className="flex flex-col gap-1">
          {order.map((title, i) => (
            <motion.div key={title} layout transition={spring.moderate}
              className={`flex h-6 items-center gap-2 rounded-md border bg-background px-2 text-control transition-opacity duration-300 ${i < read ? 'opacity-35' : ''}`}>
              <span className="w-3 text-right text-meta text-muted-foreground tabular-nums">{i + 1}</span>
              <span className={`truncate ${i < read ? 'line-through decoration-foreground/40' : 'text-foreground'}`}>{title}</span>
              {at === 0 && i === 3 && <Chip className="ml-auto">Play next</Chip>}
            </motion.div>
          ))}
        </div>
      </LayoutGroup>
    </Col>
  )
}

const WrongDemo: Demo = ({ live }) => {
  const at = useSteps([1200, 1000, 2400], live, 2)
  return (
    <Col>
      <div className="rounded-lg border bg-background px-3 py-2">
        <p className={`text-control transition-colors duration-300 ${at >= 1 ? 'text-muted-foreground' : 'text-foreground'}`}>
          Pluto is the ninth planet.{at >= 1 && <span className="ml-2 text-meta text-[var(--tt-color-text-orange)]">Superseded</span>}
        </p>
        <AnimatePresence>
          {at === 2 && <motion.div key="true" {...rise} className="mt-1.5 flex items-center gap-2 text-control text-foreground"><Chip tint="green">Now true</Chip>A dwarf planet, since 2006.</motion.div>}
        </AnimatePresence>
      </div>
    </Col>
  )
}

const SUSPEND = ['Now and then', 'Often', 'Not at all']
const SuspendDemo: Demo = ({ live }) => {
  const at = useSteps([1400, 1400, 1800], live, 0)
  return (
    <Col>
      <div className="rounded-lg border bg-background px-3 py-2 text-control text-foreground">
        <div className="flex items-center gap-2">{at === 2 && <Pause className="size-3.5 text-muted-foreground" />}<span className={at === 2 ? 'text-muted-foreground' : ''}>The map is not the territory</span></div>
        <div className="mt-1 text-meta text-muted-foreground">{['Turns up now and then, by chance', 'Keeps coming back, often', 'Resting until you choose again'][at]}</div>
      </div>
      <div className="relative grid grid-cols-3 rounded-lg bg-foreground/[0.05] p-0.5 text-center text-meta">
        <motion.span className="absolute inset-y-0.5 rounded-md bg-background shadow-sm" style={{ width: 'calc((100% - 4px) / 3)' }} initial={false} animate={{ left: `calc(2px + ${at} * (100% - 4px) / 3)` }} transition={spring.moderate} />
        {SUSPEND.map((one, i) => <span key={one} className={`relative truncate px-1 py-1 transition-colors ${at === i ? 'text-foreground' : 'text-muted-foreground'}`}>{one}</span>)}
      </div>
    </Col>
  )
}

const CLUES = ['Victor never names him', 'He learns to read from a book', 'The creature reads Paradise Lost']
const QuestionsDemo: Demo = ({ live }) => {
  const at = useSteps([900, 900, 900, 2200], live, 3)
  return (
    <Col>
      <div className="rounded-xl border bg-background px-3 py-2.5">
        <div className="flex items-center gap-2 font-heading text-control font-semibold text-foreground">Who is the real monster?{at === 3 && <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={spring.slow} className="ml-auto"><Chip tint="green"><Check className="size-3" strokeWidth={3} />Answered</Chip></motion.span>}</div>
        <div className="mt-1.5 flex flex-col gap-1">
          {CLUES.map((clue, i) => (
            <div key={clue} className={`flex items-center gap-2 text-meta transition-opacity duration-300 ${at >= i ? 'opacity-100' : 'opacity-0'}`}>
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: 'var(--tt-color-text-purple)' }} /><span className="truncate text-muted-foreground">{clue}</span>
            </div>
          ))}
        </div>
      </div>
    </Col>
  )
}

// ---------------------------------------------------------------- Planning

const DecisionDemo: Demo = ({ live }) => {
  const at = useSteps([1300, 1100, 2600], live, 2)
  return (
    <Col>
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-meta text-muted-foreground">
        Today <span className="font-medium text-foreground tabular-nums"><Rolling text={at === 0 ? '9 Oct' : '12 Jan'} by="word" /></span>
        <span className="ml-auto">Look again on 12 Jan</span>
      </div>
      <AnimatePresence>
        {at === 2 && (
          <motion.div key="back" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.slow} className="rounded-xl border bg-popover px-3 py-2.5 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.25)]">
            <div className="text-meta" style={{ color: 'var(--tt-color-text-red)' }}>Look again today</div>
            <div className="mt-0.5 text-control text-foreground">Keep the old laptop two more years</div>
            <div className="mt-2 flex gap-1.5"><span className="rounded-md bg-primary px-2 py-0.5 text-meta text-primary-foreground">Still holds</span><span className="rounded-md border px-2 py-0.5 text-meta text-muted-foreground">Reopen</span></div>
          </motion.div>
        )}
      </AnimatePresence>
    </Col>
  )
}

const OUTCOME = 'Lectures made sense'
const ExperimentDemo: Demo = ({ live }) => {
  const at = useSteps([2400, typeMs(OUTCOME), 1800], live, 2)
  const [day, setDay] = useState(14)
  useEffect(() => {
    if (!live || at !== 0) return setDay(14)
    setDay(1)
    const timer = setInterval(() => setDay((d) => Math.min(14, d + 1)), 150)
    return () => clearInterval(timer)
  }, [at, live])
  const text = useTyped(OUTCOME, at === 1)
  return (
    <Col>
      <div className="rounded-lg border bg-background px-3 py-2">
        <div className="text-control text-foreground">Hermione's method, two weeks</div>
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar value={day / 14} label="Experiment" className="flex-1" thick={3} duration={150} as="plain" fill="var(--tt-color-text-red)" />
          <span className="w-16 text-right text-meta text-muted-foreground tabular-nums">Day {day} of 14</span>
        </div>
      </div>
      <div className={`rounded-lg border bg-popover px-3 py-1.5 text-meta transition-opacity duration-300 ${at === 0 ? 'opacity-0' : 'opacity-100'}`}>
        <span className="text-muted-foreground">What did you find? </span><span className="text-foreground">{at === 1 ? text : OUTCOME}</span>{at === 1 && <Caret />}
      </div>
    </Col>
  )
}

const LOG = '+Finish Dune: read 40 pages'
const GoalsDemo: Demo = ({ live }) => {
  const at = useSteps([typeMs(LOG, 40), 2600], live, 1)
  const text = useTyped(LOG, at === 0, 40)
  return (
    <Col>
      <Box text={at === 0 ? text : LOG} caret={at === 0} className={`transition-opacity duration-300 ${at === 0 ? '' : 'opacity-40'}`} />
      <div className="rounded-lg border bg-background px-3 py-2">
        <div className="flex items-baseline gap-2 text-control text-foreground">Finish Dune before film night<span className="ml-auto text-meta" style={{ color: 'var(--tt-color-text-blue)' }}>12 days left</span></div>
        <ProgressBar value={0.6} label="Goal" className="mt-2" thick={3} duration={700} as="plain" fill="var(--tt-color-text-blue)" />
        <div className="mt-1.5 text-meta text-muted-foreground tabular-nums"><Rolling text={at === 1 ? '9' : '8'} /> steps logged</div>
      </div>
    </Col>
  )
}

const BOXES = [{ label: 'Do now', tint: 'red' }, { label: 'Plan', tint: 'blue' }, { label: 'Hand off or batch', tint: 'orange' }, { label: 'Drop or later', tint: 'gray' }]
const MatrixDemo: Demo = ({ live }) => {
  const at = useSteps([1200, 1200, 1200, 1200], live, 1)
  // Round the four boxes in turn: top left, top right, bottom right, bottom left.
  const here = [0, 1, 3, 2][at]
  return (
    <div className="grid h-[7.5rem] w-full max-w-[17rem] grid-cols-2 grid-rows-2 gap-1">
      <LayoutGroup>
        {BOXES.map((box, i) => (
          <div key={box.label} className="flex flex-col gap-1 rounded-lg border bg-background px-2 py-1 text-meta" style={{ color: `var(--tt-color-text-${box.tint})` }}>
            {box.label}
            {here === i && (
              <motion.div layoutId="matrix-task" transition={spring.slow} className="flex h-6 items-center gap-1.5 self-start rounded-md border bg-popover px-2 whitespace-nowrap text-foreground shadow-[0_2px_6px_-2px_rgb(0_0_0/0.25)]">
                <Dot on={false} /> Pay rent
              </motion.div>
            )}
          </div>
        ))}
      </LayoutGroup>
    </div>
  )
}

const RoutinesDemo: Demo = ({ live }) => {
  const at = useSteps(Array(15).fill(220).concat([1600]), live, 15)
  return (
    <Col>
      <Row className="rounded-lg border bg-background"><Dot on={false} /><span className="flex-1 truncate">Water the plants</span><Chip tint="yellow"><Repeat className="size-3" />every 3 days</Chip></Row>
      <div className="grid grid-cols-[repeat(15,1fr)] gap-1 px-1">
        {Array.from({ length: 15 }, (_, d) => (
          <span key={d} className={`aspect-square rounded-[3px] transition-colors duration-200 ${d % 3 === 0 && d <= at ? '' : 'bg-foreground/[0.07]'}`} style={d % 3 === 0 && d <= at ? { background: 'var(--tt-color-text-yellow)' } : undefined} />
        ))}
      </div>
      <div className="px-1 text-meta text-muted-foreground">Back by itself, every third day</div>
    </Col>
  )
}

const FocusDemo: Demo = ({ live }) => {
  const at = useSteps([1000, 4200], live, 1)
  const [gone, setGone] = useState(0)
  useEffect(() => {
    if (!live || at !== 1) return setGone(live ? 0 : 6 * 60000)
    const timer = setInterval(() => setGone((ms) => ms + 1000), 1000)
    return () => clearInterval(timer)
  }, [at, live])
  return (
    <Col className="items-center">
      <Row className="w-full rounded-lg border bg-background"><Dot on={false} /><span className="flex-1 truncate">Draft the repair plan</span>
        <span className={`rounded-md px-1.5 text-meta transition-colors ${at === 0 ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Focus</span></Row>
      <div className={`flex h-10 w-56 items-center gap-2.5 rounded-full border bg-popover px-3 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.25)] transition-opacity duration-300 ${at === 1 ? 'opacity-100' : 'opacity-0'}`}>
        <span className="min-w-0 flex-1 truncate text-control text-foreground">Draft the repair plan</span>
        <span className="text-control font-medium tabular-nums text-foreground">{clock(25 * 60000 - gone)}</span>
      </div>
      <ProgressBar value={gone / (25 * 60000) + 0.02} label="Focus" className={`w-56 transition-opacity ${at === 1 ? 'opacity-100' : 'opacity-0'}`} thick={2} duration={900} as="plain" fill="var(--primary)" />
    </Col>
  )
}

const SHELVES = ['This month', 'This year', 'Someday']
const LaterDemo: Demo = ({ live }) => {
  const at = useSteps([1200, 1200, 1800], live, 2)
  return (
    <div className="relative flex w-full max-w-[17rem] flex-col gap-1">
      {SHELVES.map((shelf) => <div key={shelf} className="flex h-8 items-center rounded-lg border bg-background px-2.5 text-meta text-muted-foreground">{shelf}</div>)}
      <motion.div className="absolute right-2 flex h-6 items-center gap-1.5 rounded-md border bg-popover px-2 text-meta text-foreground shadow-[0_2px_6px_-2px_rgb(0_0_0/0.25)]" initial={false}
        animate={{ top: `calc(${at} * 2.25rem + 0.25rem)` }} transition={spring.slow}>
        <Dot on={false} /> Learn to sail
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------- Seeing your year

const SCALES = [{ id: 'Day', says: 'Friday 9 October' }, { id: 'Week', says: 'Week 41: the move' }, { id: 'Month', says: 'October: finding a rhythm' }, { id: 'Year', says: '2026, in seasons' }]
const PagesDemo: Demo = ({ live }) => {
  const at = useSteps([1300, 1300, 1300, 1300], live, 0)
  return (
    <Col className="items-center">
      <div className="relative grid w-full grid-cols-4 rounded-lg bg-foreground/[0.05] p-0.5 text-center text-meta">
        <motion.span className="absolute inset-y-0.5 rounded-md bg-background shadow-sm" style={{ width: 'calc((100% - 4px) / 4)' }} initial={false} animate={{ left: `calc(2px + ${at} * (100% - 4px) / 4)` }} transition={spring.moderate} />
        {SCALES.map((scale, i) => <span key={scale.id} className={`relative py-1 transition-colors ${at === i ? 'text-foreground' : 'text-muted-foreground'}`}>{scale.id}</span>)}
      </div>
      <div className="h-12 w-full rounded-lg border bg-background px-3 py-2">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={at} {...rise} className="font-heading text-control font-semibold text-foreground">{SCALES[at].says}</motion.div>
        </AnimatePresence>
        <div className="mt-1.5"><Line w={`${85 - at * 15}%`} /></div>
      </div>
    </Col>
  )
}

const SEASONS = [{ name: 'Moving house', from: 0, to: 3, tint: 'orange' }, { name: 'The new job', from: 3, to: 8, tint: 'blue' }, { name: 'Learning to rest', from: 8, to: 12, tint: 'green' }]
const YearDemo: Demo = ({ live }) => {
  const at = useSteps([700, 700, 700, 2600], live, 3)
  return (
    <div className="flex w-full max-w-[18rem] flex-col gap-2">
      <div className="grid grid-cols-12 border-b border-foreground/10 pb-1 text-center text-[0.625rem] text-muted-foreground">{'JFMAMJJASOND'.split('').map((m, i) => <span key={i}>{m}</span>)}</div>
      {SEASONS.map((season, i) => (
        <div key={season.name} className="relative h-8">
          <motion.span className="absolute top-0 text-meta whitespace-nowrap" style={{ left: `${(season.from / 12) * 100}%`, color: `var(--tt-color-text-${season.tint})`, transform: season.from > 6 ? 'translateX(-30%)' : undefined }}
            initial={false} animate={{ opacity: at > i ? 1 : 0 }} transition={{ duration: 0.4, delay: at > i ? 0.25 : 0 }}>{season.name}</motion.span>
          <motion.span className="absolute bottom-1 h-1.5 rounded-full" style={{ left: `${(season.from / 12) * 100}%`, background: `var(--tt-color-text-${season.tint})` }}
            initial={false} animate={{ width: at > i ? `calc(${((season.to - season.from) / 12) * 100}% - 3px)` : '0%' }} transition={{ duration: 0.6, ease: EASE }} />
        </div>
      ))}
    </div>
  )
}

const MARKED = [{ name: 'Exam', d: 0.18, tint: 'red' }, { name: 'Launch', d: 0.52, tint: 'blue' }, { name: "Mum's birthday", d: 0.8, tint: 'pink' }]
const MilestonesDemo: Demo = ({ live }) => {
  const at = useSteps([800, 800, 800, 2400], live, 3)
  return (
    <div className="flex w-full max-w-[18rem] flex-col gap-2">
      <div className="relative h-14">
        <svg aria-hidden viewBox="0 0 288 56" className="absolute inset-0 h-full w-full overflow-visible">
          {Array.from({ length: 72 }, (_, i) => <path key={i} d={`M${i * 4 + 2} 56V${i % 6 === 0 ? 44 : 49}`} stroke="var(--foreground)" strokeWidth={1} opacity={i < 30 ? 0.45 : 0.22} />)}
          <path d="M122 56V30" stroke="var(--primary)" strokeWidth={2} />
        </svg>
        {MARKED.map((mark, i) => (
          // Past the middle, a mark's name hangs to the left of its line, so it never runs off the stage.
          <motion.span key={mark.name} className={`absolute bottom-0 flex flex-col ${mark.d > 0.6 ? 'items-end' : 'items-start'}`} style={{ left: `${mark.d * 100}%`, translate: mark.d > 0.6 ? '-100% 0' : undefined }}
            initial={false} animate={{ opacity: at > i ? 1 : 0, y: at > i ? 0 : 6 }} transition={{ duration: 0.35, ease: EASE }}>
            <span className="-ml-px text-[0.625rem] leading-none font-medium whitespace-nowrap" style={{ color: `var(--tt-color-text-${mark.tint})` }}>{mark.name}</span>
            <span className="mt-1 block h-10 w-[1.75px]" style={{ background: `var(--tt-color-text-${mark.tint})` }} />
          </motion.span>
        ))}
      </div>
      <div className={`text-control text-foreground transition-opacity duration-300 ${at >= 3 ? 'opacity-100' : 'opacity-0'}`}><span style={{ color: 'var(--tt-color-text-blue)' }}>◆</span> 23 days to Launch</div>
    </div>
  )
}

const TAKEAWAY = 'Fear is the mind-killer.'
const BookDemo: Demo = ({ live }) => {
  const at = useSteps([900, 300, 300, 300, 300, typeMs(TAKEAWAY, 40), 1600], live, 6)
  const stars = Math.min(4, Math.max(0, at))
  const text = useTyped(TAKEAWAY, at === 5, 40)
  return (
    <Col>
      <div className="rounded-lg border bg-background px-3 py-2">
        <div className="flex items-center gap-2 text-control text-foreground">Dune, Frank Herbert <Chip tint="red">#book</Chip></div>
        <div className="mt-2 grid grid-cols-[4rem_1fr] items-center gap-y-1.5 text-meta">
          <span className="text-muted-foreground">Status</span><span><Chip tint={at === 0 ? 'blue' : 'green'}><Rolling text={at === 0 ? 'Reading' : 'Finished'} by="word" /></Chip></span>
          <span className="text-muted-foreground">Rating</span>
          <span className="flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className="size-3.5 text-muted-foreground transition-colors duration-200" style={stars >= n ? { fill: 'var(--tt-color-text-yellow)', color: 'var(--tt-color-text-yellow)' } : undefined} />)}</span>
          <span className="text-muted-foreground">Takeaway</span><span className="truncate text-foreground">{at < 5 ? '' : at === 5 ? text : TAKEAWAY}{at === 5 && <Caret />}</span>
        </div>
      </div>
    </Col>
  )
}

const WRAPPED = [{ n: '214', said: 'things caught this year' }, { n: '14 March', said: 'your busiest day' }, { n: '4', said: 'books finished' }]
const WrappedDemo: Demo = ({ live }) => {
  const at = useSteps([1600, 1600, 1600], live, 0)
  return (
    <div className="flex h-28 w-full max-w-[17rem] flex-col justify-center rounded-xl border bg-background px-4">
      <div className="text-meta text-muted-foreground">Your year, wrapped</div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={at} {...rise}>
          <div className="font-heading text-[1.75rem] leading-tight font-semibold text-foreground tabular-nums">{WRAPPED[at].n}</div>
          <div className="text-control text-muted-foreground">{WRAPPED[at].said}</div>
        </motion.div>
      </AnimatePresence>
      <div className="mt-2 flex gap-1">{WRAPPED.map((_, i) => <span key={i} className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${i <= at ? 'bg-foreground/60' : 'bg-foreground/12'}`} />)}</div>
    </div>
  )
}

const NODES: [number, number][] = [[40, 30], [110, 18], [170, 48], [80, 80], [150, 96], [220, 70], [30, 100], [205, 20]]
const EDGES: [number, number][] = [[0, 1], [1, 2], [0, 3], [3, 4], [2, 4], [2, 5], [3, 6], [1, 7], [5, 7]]
const MapDemo: Demo = ({ live }) => {
  const at = useSteps([2400, 1800], live, 1)
  return (
    <svg viewBox="0 0 250 120" className="h-[7.5rem] w-full max-w-[17rem]" aria-hidden>
      {EDGES.map(([a, b], i) => (
        <motion.line key={i} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke="color-mix(in oklab, var(--foreground) 30%, transparent)" strokeWidth={1}
          initial={false} animate={{ pathLength: at === 1 || !live ? 1 : 0.0001 }} transition={{ duration: 0.5, delay: at === 1 ? i * 0.12 : 0, ease: EASE }} />
      ))}
      {NODES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 2 ? 5 : 3.5} fill={i === 2 ? 'var(--tt-color-text-purple)' : 'var(--foreground)'} opacity={i === 2 ? 1 : 0.7} />)}
    </svg>
  )
}

// ---------------------------------------------------------------- Windows

const STICKY = ['Buy stamps', 'Call the bank', 'Post the letter']
const StickiesDemo: Demo = ({ live }) => {
  const at = useSteps([900, 900, 900, 1600], live, 2)
  return (
    <div className="relative mt-2 w-44 rotate-[-2deg] rounded-lg border px-3 pt-3.5 pb-2.5 text-control text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.14),0_4px_10px_-2px_rgb(0_0_0/0.16)]"
      style={{ background: 'linear-gradient(color-mix(in oklab, var(--tt-color-text-yellow) 7%, transparent), color-mix(in oklab, var(--tt-color-text-yellow) 7%, transparent)), var(--popover)' }}>
      <Tape />
      <div className="mb-1.5 font-heading font-semibold">Today</div>
      {STICKY.map((task, i) => {
        const done = at > i && at < 3
        return (
          <div key={task} className="flex h-6 items-center gap-2">
            <Dot on={done} tint="var(--tt-color-text-green)" />
            <span className={done ? 'mf-hand-struck text-muted-foreground line-through' : ''}>{done ? <Struck seed={task} draw={live}>{task}</Struck> : task}</span>
          </div>
        )
      })}
    </div>
  )
}

const RecordingsDemo: Demo = ({ live }) => {
  const at = useSteps([1300, 2400], live, 1)
  const frame = (title: string, blank: boolean): React.JSX.Element => (
    <div className="flex flex-1 flex-col gap-1">
      <div className="flex items-center gap-1 text-meta text-muted-foreground">{title}{title === 'They see' && <span className={`ml-auto size-1.5 rounded-full bg-[var(--tt-color-text-red)] ${live ? 'animate-pulse' : ''}`} />}</div>
      <div className="h-20 rounded-lg border bg-background p-2">
        <div className="mb-2 flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 rounded-full bg-foreground/15" />)}</div>
        <div className={`flex flex-col gap-1.5 transition-opacity duration-500 ${blank ? 'opacity-0' : 'opacity-100'}`}><Line w="80%" /><Line w="60%" /><Line w="70%" /></div>
      </div>
    </div>
  )
  return <div className="flex w-full max-w-[17rem] gap-3">{frame('You see', false)}{frame('They see', at === 1)}</div>
}

const WindowDemo: Demo = ({ live }) => {
  const at = useSteps([1200, 700, 2400], live, 2)
  return (
    <div className="relative h-[7.5rem] w-full max-w-[17rem]">
      <div className="rounded-lg border bg-background py-1">
        {['Ideas for the garden', 'Raised beds', 'What to plant in March'].map((row, i) => <Row key={row} className={i === 1 && at >= 1 ? 'bg-foreground/[0.06]' : 'text-muted-foreground'}><span className="truncate">{row}</span></Row>)}
      </div>
      <AnimatePresence>
        {at === 2 && (
          <motion.div key="win" className="absolute top-8 right-0 w-40 rounded-lg border bg-popover p-2 shadow-[0_10px_24px_-8px_rgb(0_0_0/0.35)]" initial={{ opacity: 0, scale: 0.6, x: -40, y: 6 }} animate={{ opacity: 1, scale: 1, x: 0, y: 0 }} exit={{ opacity: 0 }} transition={spring.slow}>
            <div className="mb-1.5 flex gap-1">{['red', 'yellow', 'green'].map((c) => <span key={c} className="size-1.5 rounded-full" style={{ background: `var(--tt-color-text-${c})` }} />)}</div>
            <div className="text-meta font-medium text-foreground">Raised beds</div>
            <div className="mt-1.5 flex flex-col gap-1"><Line w="90%" /><Line w="70%" /></div>
          </motion.div>
        )}
      </AnimatePresence>
      <Pointer x={at === 0 ? 210 : 60} y={at === 0 ? 100 : 40} press={at === 1} />
      <span className={`absolute bottom-0 left-0 flex items-center gap-1 text-meta text-muted-foreground transition-opacity ${at === 1 ? 'opacity-100' : 'opacity-0'}`}><Kbd>⌘</Kbd> click</span>
    </div>
  )
}

const SafeDemo: Demo = ({ live }) => {
  const at = useSteps([1600, 2200], live, 1)
  const safe = at === 1
  return (
    <Col className="items-center">
      <div className={`w-full rounded-xl border bg-popover px-3 py-2.5 shadow-[0_6px_16px_-6px_rgb(0_0_0/0.25)] transition-opacity duration-500 ${safe ? 'opacity-0' : 'opacity-100'}`}>
        <div className="text-meta text-muted-foreground">Coming back to you</div>
        <div className="mt-0.5 text-control text-foreground">Salary talk notes</div>
      </div>
      <span className={`text-meta text-muted-foreground transition-opacity duration-300 ${safe ? 'opacity-100' : 'opacity-0'}`}>Safe mode is on, so nothing comes back on its own.</span>
    </Col>
  )
}

const LockDemo: Demo = ({ live }) => {
  const at = useSteps([1300, 2400], live, 1)
  const locked = at === 1
  return (
    <Col>
      <div className={`rounded-xl border bg-popover px-3 py-2.5 transition-colors ${locked ? '' : ''}`}>
        <div className="flex items-center gap-2 text-meta text-muted-foreground">
          {locked ? <Lock className="size-3.5" style={{ color: 'var(--tt-color-text-orange)' }} /> : <Unlock className="size-3.5" />}
          {locked ? 'Read only' : 'Editing'}
        </div>
        <p className="mt-1 text-control text-foreground">Wi-Fi password is on the fridge. Router is in the hall cupboard.{!locked && <Caret />}</p>
      </div>
    </Col>
  )
}

// ---------------------------------------------------------------- Bringing notes in

const VAULT = ['Books.md', 'Ideas/Garden.md', 'People/Sam.md']
const VaultDemo: Demo = ({ live }) => {
  const at = useSteps([600, 500, 500, 2200], live, 3)
  return (
    <div className="flex w-full max-w-[17rem] items-center gap-3">
      <div className="flex w-20 flex-col items-center gap-1 text-meta text-muted-foreground"><Folder className="size-8" style={{ color: 'var(--tt-color-text-purple)' }} strokeWidth={1.5} />My vault</div>
      <div className="flex-1 rounded-lg border bg-background py-1">
        {VAULT.map((file, i) => (
          <motion.div key={file} initial={false} animate={{ opacity: at > i ? 1 : 0, x: at > i ? 0 : -12 }} transition={{ duration: 0.35, ease: EASE }}>
            <Row className="h-6"><FileText className="size-3 shrink-0 text-muted-foreground" /><span className="truncate text-meta">{file.split('/').pop()!.replace('.md', '')}</span></Row>
          </motion.div>
        ))}
        <div className="px-2 pt-0.5 text-meta text-muted-foreground tabular-nums"><Rolling text={at >= 3 ? 128 : at * 41} /> notes</div>
      </div>
    </div>
  )
}

const SOURCES = [{ name: 'Readwise', tint: 'yellow' }, { name: 'Kindle', tint: 'orange' }, { name: 'Anki', tint: 'blue' }, { name: 'Markdown', tint: 'gray' }, { name: 'Bookmarks', tint: 'green' }]
const FilesDemo: Demo = ({ live }) => {
  const at = useSteps([700, 700, 700, 700, 700, 1500], live, 5)
  return (
    <div className="flex w-full max-w-[17rem] flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-1">
        {SOURCES.map((source, i) => <span key={source.name} className={`transition-opacity duration-300 ${at === i ? 'opacity-100' : at > i ? 'opacity-35' : 'opacity-100'}`}><Chip tint={source.tint}>{source.name}</Chip></span>)}
      </div>
      <div className="flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-meta">
        <span className="text-muted-foreground">Highlights kept</span>
        <span className="ml-auto font-medium text-foreground tabular-nums"><Rolling text={[0, 312, 340, 451, 470, 482][at]} /></span>
      </div>
    </div>
  )
}

const EMBED = '![[route-map.png]]'
const EmbedsDemo: Demo = ({ live }) => {
  const at = useSteps([typeMs(EMBED, 70), 600, 2400], live, 2)
  const text = useTyped(EMBED, at === 0, 70)
  return (
    <Col>
      <div className="rounded-lg border bg-background px-3 py-2 text-control text-foreground">
        <div className="text-muted-foreground">Packing for Lisbon, see:</div>
        <AnimatePresence mode="popLayout" initial={false}>
          {at < 2 ? (
            <motion.div key="raw" exit={{ opacity: 0 }} className="mt-1"><Said text={at === 0 ? text : EMBED} />{at === 0 && <Caret />}</motion.div>
          ) : (
            <motion.div key="card" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={spring.slow} className="mt-1.5 rounded-md border border-[color-mix(in_srgb,var(--tt-color-text-green)_22%,transparent)] bg-[color-mix(in_srgb,var(--tt-color-text-green)_6%,transparent)] px-2.5 py-1.5">
              <div className="h-12 rounded-sm bg-[color-mix(in_srgb,var(--tt-color-text-green)_18%,transparent)]" />
              <div className="mt-1 text-meta text-muted-foreground">route-map.png</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className={`px-1 text-meta text-muted-foreground transition-opacity ${at === 1 ? 'opacity-100' : 'opacity-0'}`}>Fetching it from your vault…</div>
    </Col>
  )
}

export const DEMOS: Record<string, Demo> = {
  box: BoxDemo, timer: TimerDemo, clue: ClueDemo, tagtask: TagTaskDemo, remind: RemindDemo, comingback: ComingBackDemo, onetask: OneTaskDemo, merge: MergeDemo,
  board: BoardDemo, versions: VersionsDemo, find: FindDemo, aliases: AliasesDemo, calc: CalcDemo, fold: FoldDemo, bit: BitDemo, glossary: GlossaryDemo,
  review: ReviewDemo, cloze: ClozeDemo, context: ContextDemo, readthrough: ReadThroughDemo, queue: QueueDemo, wrong: WrongDemo, suspend: SuspendDemo, questions: QuestionsDemo,
  decision: DecisionDemo, experiment: ExperimentDemo, goals: GoalsDemo, matrix: MatrixDemo, routines: RoutinesDemo, focus: FocusDemo, later: LaterDemo,
  pages: PagesDemo, year: YearDemo, milestones: MilestonesDemo, book: BookDemo, wrapped: WrappedDemo, map: MapDemo,
  stickies: StickiesDemo, recordings: RecordingsDemo, window: WindowDemo, safe: SafeDemo, lock: LockDemo,
  vault: VaultDemo, files: FilesDemo, embeds: EmbedsDemo
}
