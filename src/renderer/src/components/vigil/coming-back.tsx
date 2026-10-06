import { motion } from 'motion/react'
import { Repeat2 } from 'lucide-react'

import { chime } from '@/lib/sound'
import { useLive } from '@/lib/vigil'
import { issues, type Repeat } from '@/lib/issues'
import { Tip, toast } from './ui'
import { num } from '../../../../main/dates'

/**
 * The same idea caught three times or more says it is unfinished, not that
 * it is important: so the card says so, once, and offers the way out, an
 * article that starts from a link to each time. Once one is written, the card
 * points to it instead.
 */
export function ComingBack({ id, className = '' }: { id: string; className?: string }): React.JSX.Element | null {
  const found = useLive(() => issues.repeats([id]), {} as Record<string, Repeat>, [id], ['capture', 'item'])[id]
  if (!found) return null
  const write = (): void =>
    void issues.repeatArticle(found.ids.map((one) => one.id)).then((article) => {
      chime('promote')
      toast(`An article, from ${num(found.n)} captures of the same idea`)
      window.api.openInHome('article', article)
    })
  const open = (): void => {
    if (!found.article) return
    chime('open')
    window.api.openInHome('article', found.article.id)
  }
  // One run of words that wraps as a sentence does, the count and the way out inline with it.
  return (
    <motion.p initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={`text-xs leading-relaxed text-pretty text-muted-foreground ${className}`}>
      <Tip label={<span className="flex flex-col gap-0.5">{found.ids.slice(0, 6).map((one) => <span key={one.id} className="max-w-64 truncate"><span className="font-mono text-muted-foreground">MF-{one.number}</span> {one.title}</span>)}{found.n > 6 && <span>and {num(found.n - 6)} more</span>}</span>}>
        <span className="mr-1.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full bg-accent px-1.5 align-middle font-mono text-[0.6875rem] leading-[1.125rem] text-foreground/80 tabular-nums">
          <Repeat2 className="size-3" aria-hidden /> {num(found.n)}×
        </span>
      </Tip>
      {found.article ? (
        <>
          You wrote the thing: <span className="text-foreground">“{found.article.title}”</span>.{' '}
          <button type="button" onClick={open} className="rounded-sm font-medium whitespace-nowrap text-foreground underline decoration-foreground/30 underline-offset-2 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open it</button>
        </>
      ) : (
        <>
          You keep coming back to this ({num(found.n)} times). <span className="text-foreground">Write the thing that lets you stop.</span>{' '}
          <Tip label="A new article, its first lines a link to each time you caught it">
            <button type="button" onClick={write} className="rounded-sm font-medium whitespace-nowrap text-[var(--tt-brand-color-400)] underline decoration-[color-mix(in_srgb,var(--tt-brand-color-400)_35%,transparent)] underline-offset-2 transition-colors hover:decoration-[var(--tt-brand-color-400)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Write it</button>
          </Tip>
        </>
      )}
    </motion.p>
  )
}
