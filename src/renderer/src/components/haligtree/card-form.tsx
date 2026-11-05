import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tip } from './ui'
import { Kbd } from '@/components/ui/kbd'
import { DeckPick } from './decks'
import { INPUT_FRAME } from './hash-field'

/**
 * Review's three ways to make cards ("Make a card", "Add many at once", "From
 * a picture") as one form: on a card face that wears Review's finish (Satin's
 * metal or Paper's stock, data-finish-face), a bold name and one quiet line,
 * what it is made from, and one foot. ⌘↵ makes, Esc closes.
 */
export function CardForm({ head, line, keys, children, foot, ...rest }: {
  head: string
  line: ReactNode
  /** ⌘↵ and Esc, and the form's own keys. */
  keys: (event: React.KeyboardEvent) => void
  children: ReactNode
  foot: ReactNode
} & Omit<React.ComponentProps<'section'>, 'onKeyDown'>): React.JSX.Element {
  return (
    <section data-finish-face data-card-form onKeyDown={keys} tabIndex={-1} className="flex flex-col gap-3 rounded-[6px] border px-5 pt-4 pb-3 outline-none" {...rest}>
      <p data-card-form-head className="text-control text-pretty text-foreground/80"><b className="font-semibold text-foreground">{head}.</b> {line}</p>
      {children}
      {foot}
    </section>
  )
}

/** Words written straight onto the card, as "Ask another way" writes: no box, the faint italic line says where. */
export const CARD_FIELD = 'field-sizing-content w-full resize-none bg-transparent text-foreground outline-none placeholder:italic placeholder:font-normal placeholder:text-muted-foreground'

/** "#rome #food, or rome food": the tags typed, as tags, without the deck. */
export const tagsIn = (typed: string): string[] =>
  typed.split(/[\s,]+/).map((one) => one.trim().toLowerCase().replace(/^#/, '').replace(/[^\p{L}\p{M}\p{N}_/-]+/gu, '-').replace(/^-+|-+$/g, '')).filter(Boolean)

/**
 * The one foot of the three: where the cards go (deck, more tags, both ways
 * when a card has two sides), then Cancel and the one button that makes them,
 * always in the same place, the same colour, greyed until there is something
 * to make. `status` is a quiet line over it ("Each card gets #spanish").
 */
export function CardFormFoot({ deck, onDeck, tags, onTags, both, onBoth, status, cancel = 'Cancel', onCancel, go, ready, onGo, mark }: {
  deck: string
  onDeck: (tag: string) => void
  tags: string
  onTags: (typed: string) => void
  /** Left out where a card has no second side to ask first (a picture's). */
  both?: boolean
  onBoth?: (on: boolean) => void
  status?: ReactNode
  cancel?: string
  onCancel: () => void
  go: string
  ready: boolean
  onGo: () => void
  /** The make button's data mark, for the probes. */
  mark: string
}): React.JSX.Element {
  return (
    <div data-card-form-foot className="grid gap-2 border-t border-dashed border-foreground/15 pt-2.5">
      {status && <p data-card-form-status className="text-control text-foreground/70">{status}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <DeckPick value={deck} onChange={onDeck} />
        <input data-card-form-tags value={tags} onChange={(event) => onTags(event.target.value)} placeholder="More tags" aria-label="More tags"
          className={`${INPUT_FRAME} h-8 w-32 text-control text-foreground placeholder:text-foreground/70 max-sm:h-9`} />
        {onBoth && (
          <Tip label="A second card asks the answer first: for when you meet the answer first, like a word you hear">
            <label data-new-both-row className="flex h-8 cursor-pointer items-center gap-1.5 px-1 text-control">
              <Switch size="sm" data-new-both checked={!!both} onCheckedChange={onBoth} className="cursor-pointer" /><span className="text-foreground/70">Both ways</span>
            </label>
          </Tip>
        )}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" className="h-8 cursor-pointer" data-card-form-cancel onClick={onCancel}>{cancel} <Kbd>Esc</Kbd></Button>
        <Button size="sm" className="h-8 cursor-pointer tabular-nums" data-card-form-go {...{ [`data-${mark}`]: '' }} disabled={!ready} onClick={onGo}>{go} <Kbd>⌘↵</Kbd></Button>
      </div>
    </div>
  )
}
