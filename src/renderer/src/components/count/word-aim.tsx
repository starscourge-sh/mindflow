import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import dayjs from 'dayjs'

import { useCounts } from './word-count'
import { parseAim } from './aim-words'
import { dated, num } from '../../../../main/dates'
import { chime } from '@/lib/sound'
import { ask, toast } from '@/components/vigil/ui'
import { frontPane } from '@/lib/split'

/**
 * A finish line for a piece of writing: an optional aim per note, "800
 * words" or "800 by Friday". A hairline over the words fills as you write,
 * charges from 90%, and at the aim says so once: "800. That's the piece."
 * Kept on this Mac with the note's id; ⌘K's "Set a word aim" sets it, and a
 * click on its line changes or clears it.
 */

type Aim = { words: number; by: string | null; reached?: boolean }
const keyOf = (id: string): string => `mf:aim:${id}`
const read = (id: string): Aim | null => {
  try {
    const raw = localStorage.getItem(keyOf(id))
    const aim = raw ? (JSON.parse(raw) as Aim) : null
    return aim && aim.words > 0 ? aim : null
  } catch {
    return null
  }
}
const write = (id: string, aim: Aim | null): void => {
  try {
    if (aim) localStorage.setItem(keyOf(id), JSON.stringify(aim))
    else localStorage.removeItem(keyOf(id))
  } catch {
    // Storage refused: the aim lasts while the note is open.
  }
  window.dispatchEvent(new CustomEvent('mindflow:aim-changed', { detail: id }))
}

/** "Friday", "tomorrow", "3 June": how the day reads from today. */
const dayWords = (by: string): string => {
  const days = dayjs(by).startOf('day').diff(dayjs().startOf('day'), 'day')
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : days > 1 && days < 7 ? dayjs(by).format('dddd') : dated(by, 'D MMMM')
}

const still = (): boolean => document.documentElement.dataset.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches

export function WordAim({ editor, id }: { editor: Editor | null; id: string }): React.JSX.Element | null {
  const [aim, setAim] = useState<Aim | null>(() => read(id))
  useEffect(() => {
    setAim(read(id))
    const changed = (event: Event): void => void ((event as CustomEvent<string>).detail === id && setAim(read(id)))
    window.addEventListener('mindflow:aim-changed', changed)
    return () => window.removeEventListener('mindflow:aim-changed', changed)
  }, [id])
  const counts = useCounts(aim ? editor : null)

  // ⌘K's "Set a word aim": answered by the note in front, in the pane that has the keys.
  useEffect(() => {
    const onAsk = (): void => {
      const dom = editor?.view.dom
      if (!dom?.isConnected || !(dom as HTMLElement).offsetParent) return
      const pane = dom.closest('[data-pane]')?.getAttribute('data-pane')
      if (pane && frontPane() && pane !== frontPane()) return
      void setOrChange()
    }
    window.addEventListener('mindflow:aim', onAsk)
    return () => window.removeEventListener('mindflow:aim', onAsk)
  })
  const setOrChange = async (): Promise<void> => {
    const now = read(id)
    const said = await ask(now ? 'A new aim for this piece (empty clears it)' : 'An aim for this piece', '800 words, or 800 by Friday', undefined, now ? `${now.words}${now.by ? ` by ${dated(now.by, 'D MMMM')}` : ''}` : '')
    if (said === null) return
    if (!said.trim()) {
      if (!now) return
      write(id, null)
      chime('off')
      return toast('Word aim cleared', () => write(id, now))
    }
    const next = parseAim(said)
    if (!next) return void (chime('nope'), toast('Say how many words: 800, or 800 by Friday', undefined, 'info'))
    write(id, { ...next, reached: !!now && now.reached && next.words <= now.words })
    chime('goal')
    toast(`Aiming for ${num(next.words)} words${next.by ? ` by ${dayWords(next.by)}` : ''}`, () => write(id, now))
  }

  // Lined up with the words' own column, wherever the page puts it.
  const [column, setColumn] = useState<{ left: number; width: number } | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dom = editor?.view.dom
    const holder = bar.current?.parentElement
    if (!aim || !dom || !holder) return
    const measure = (): void => {
      const style = getComputedStyle(dom)
      const box = dom.getBoundingClientRect()
      const left = box.left + parseFloat(style.paddingLeft) - holder.getBoundingClientRect().left
      const width = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      setColumn((was) => (was && Math.abs(was.left - left) < 1 && Math.abs(was.width - width) < 1 ? was : { left, width }))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(dom)
    watch.observe(holder)
    return () => watch.disconnect()
  }, [aim, editor, !!counts])

  // The aim met: said once, with its chord, and never again for that aim.
  const words = counts?.words ?? 0
  const [said, setSaid] = useState(false)
  useEffect(() => {
    if (!aim || !counts || aim.reached || words < aim.words) return
    write(id, { ...aim, reached: true })
    chime('aimed')
    setSaid(true)
    const quiet = setTimeout(() => setSaid(false), 5000)
    return () => clearTimeout(quiet)
  }, [words >= (aim?.words ?? Infinity)]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!aim || !counts) return null
  const share = Math.min(1, words / aim.words)
  const charging = share >= 0.9 && share < 1
  const done = share >= 1
  const late = aim.by && !done && dayjs(aim.by).endOf('day').isBefore(dayjs())
  const left = Math.max(0, aim.words - words)
  return (
    <div ref={bar} data-word-aim={done ? 'done' : charging ? 'charging' : 'on'} className="mf-aim pointer-events-none absolute inset-x-0 top-0 z-20 h-9 bg-background"
      style={column ? undefined : { visibility: 'hidden' }}>
      <div className="absolute top-2" style={column ? { left: column.left, width: column.width } : undefined}>
        <div className="relative h-[3px] overflow-hidden rounded-full bg-foreground/10">
          {/* The whole width, scaled from the left: each word grows it on the compositor. */}
          <div className={`mf-aim-fill absolute inset-0 origin-left rounded-full transition-[transform,background-color] duration-500 ${done || charging ? 'bg-primary' : 'bg-foreground/45'}`}
            style={{ transform: `scaleX(${share})`, transitionTimingFunction: 'var(--mf-ease)' }} />
        </div>
        <button type="button" onClick={() => void setOrChange()}
          className="pointer-events-auto absolute top-1.5 right-0 rounded-md px-1 text-control whitespace-nowrap tabular-nums text-foreground/75 transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Change or clear the word aim">
          {said ? (
            <span key="said" className={`font-semibold text-foreground ${still() ? '' : 'animate-in fade-in-0 slide-in-from-bottom-1 duration-300'}`}>{num(aim.words)}. That's the piece.</span>
          ) : done ? (
            <span>{num(words)} words, the aim met</span>
          ) : charging ? (
            <span><span className="font-semibold text-foreground">Nearly there:</span> {num(left)} to go</span>
          ) : (
            <span>{num(words)} of {num(aim.words)} words{aim.by ? <> · <span className={late ? 'font-semibold text-[var(--tt-color-text-orange)]' : ''}>{late ? `was due ${dayWords(aim.by)}` : `by ${dayWords(aim.by)}`}</span></> : ''}</span>
          )}
        </button>
      </div>
    </div>
  )
}
