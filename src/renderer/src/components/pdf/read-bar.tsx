import { useLayoutEffect, useRef, useState } from "react"
import { BookOpenText, Copy, Gem, Highlighter, Quote, SquareDashed, SquareStack, Trash2 } from "lucide-react"
import { Toolbar } from "@/components/tiptap-ui-primitive/toolbar"
import { ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@/components/ui/context-menu"
import { MenuPeek, type MenuPeekEntry } from "@/components/haligtree/menu-peeks"
import { MCard } from "@/components/haligtree/peek"

/**
 * A highlight's colours, as readers keep them (Apple Books, Zotero,
 * Readwise): the book's own first, then four more to mean what you like.
 * A mark with no colour of its own is drawn in the book's.
 */
export const MARK_COLORS = [
  { id: null, label: "Book colour", css: "var(--tt-brand-color-500, #c08a2e)" },
  { id: "yellow", label: "Yellow", css: "#e8b400" },
  { id: "green", label: "Green", css: "#3fae5a" },
  { id: "blue", label: "Blue", css: "#3b8fe0" },
  { id: "pink", label: "Pink", css: "#e0569a" },
  // Words marked to turn into cards later: "Make your marked cards" asks for each.
  // Not a colour: a dashed underline in the book's colour and a tick in the
  // margin, so it is never taken for a highlight or a search match (violet).
  { id: "later", label: "Mark for a card", css: "var(--tt-brand-color-500, #c08a2e)" },
] as const
export type MarkColor = (typeof MARK_COLORS)[number]["id"]

/** The colour a highlight is drawn in. */
export const markCss = (color: string | null | undefined): string => (MARK_COLORS.find((one) => one.id === (color ?? null)) ?? MARK_COLORS[0]).css

/** The colour the last highlight was made in: the next one is made in it too. */
export const lastColor = (): MarkColor => {
  const kept = localStorage.getItem("pdf-mark-color")
  return (MARK_COLORS.find((one) => one.id === kept)?.id ?? null) as MarkColor
}
export const rememberColor = (color: MarkColor): void => localStorage.setItem("pdf-mark-color", color ?? "")

/** Words with where they came from, as a quote is cited: “words” (Author, Title, p. 3). */
export const cited = (quote: string, where: string): string => `“${quote}” (${where})`

/** What picked words can become, every reader's: the bar's buttons, the right click's rows, and their keys. */
export type ReadActions = {
  highlight: (color: MarkColor) => void
  keep: () => void
  copy: () => void
  /** The words looked up where they sit: the dictionary and Wikipedia. */
  lookUp: () => void
  /** A card whose answer is the picked words: the question is asked where they were. A study card, in Review only; `gem` (⌥ held): kept as a gem too. */
  card?: (gem?: boolean) => void
  /** A fill-in-the-blank card: the sentence round the words, the words blanked. `gem` as for `card`. */
  blank?: (gem?: boolean) => void
}

/** What "Mark for a card" does, said on its swatch wherever it shows. */
export const LATER_TIP = "Mark for a card: mark words to turn into cards later, all at once"

/** A swatch: a round of the colour, ticked when it is the one in use. */
function Swatch({ color, on, later = false }: { color: string; on: boolean; /** "Mark for a card": drawn as its dashed underline, not a colour. */ later?: boolean }): React.JSX.Element {
  // "Mark for a card" is not a colour: a little card over the dashed underline it leaves in the page, filled when it is the one in use.
  if (later)
    return (
      <span aria-hidden className="pdf-swatch is-later" style={{ color }}>
        <svg viewBox="0 0 16 16">
          <rect x="3" y="2.25" width="10" height="7.5" rx="1.75" fill={on ? "currentColor" : "none"} fillOpacity={on ? 0.35 : undefined} stroke="currentColor" strokeWidth="1.4" />
          <path d="M1.5 13.5h13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="2.4 1.6" strokeLinecap="butt" />
        </svg>
      </span>
    )
  return (
    <span aria-hidden className={`pdf-swatch${later ? " is-later" : ""}`} style={later ? { color } : { background: color }}>
      {on && (
        <svg viewBox="0 0 12 12">
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

/**
 * Over the picked words, as the note editor's own selection bar: "Highlight"
 * in the colour last used, the other colours beside it, then "Keep" as a gem
 * and "Copy" with the book and page. Each shows its key.
 */
/**
 * Where a bar or a field floats over the picked words: centred on them and
 * kept inside the pane (a half-width pane cut the bar off at its edge), above
 * them unless that would hide words there (a heading, the line before), then
 * under the picked line, so the words round the picked ones stay in sight.
 */
function usePlaced(box: React.RefObject<HTMLDivElement | null>, at: { x: number; y: number; bottom?: number }): React.CSSProperties {
  const [width, setWidth] = useState(0)
  const [room, setRoom] = useState(Infinity)
  const [below, setBelow] = useState(false)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    setWidth(el.offsetWidth)
    setRoom(el.parentElement?.clientWidth ?? Infinity)
  }, [box])
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !width || at.bottom === undefined) return
    const r = el.getBoundingClientRect()
    // The words it would sit on: a PDF's text pieces, an article's lines (measured as drawn, line by line).
    const hides = [...(el.parentElement?.querySelectorAll(".textLayer span, .web-reader-body :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, td)") ?? [])].some((one) => {
      if (!one.textContent?.trim() || one.querySelector(".textLayer span, p")) return false
      const range = document.createRange()
      range.selectNodeContents(one)
      return [...range.getClientRects()].some((line) => line.width && line.left < r.right && line.right > r.left && line.top < r.bottom && line.bottom > r.top)
    })
    setBelow(hides)
  }, [box, width, at.x, at.y, at.bottom])
  return {
    left: Math.max(8, Math.min(at.x - width / 2, room - width - 8)),
    top: below && at.bottom !== undefined ? at.bottom + 8 : Math.max(8, at.y - 48),
  }
}

/**
 * The keys for picked words in this reader (shown as keycaps on their right-click menu): H
 * highlights in the last colour, 1 to 6 in each colour (6 is "Mark for a card"), K keeps a gem, ⇧⌘C
 * copies with the citation. Says whether the key was one.
 */
export function readKey(event: KeyboardEvent, actions: ReadActions): boolean {
  const field = event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable=true]")
  if (field) return false
  if (event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey && event.code === "KeyC") return actions.copy(), true
  if (event.shiftKey && !event.metaKey && !event.ctrlKey && event.code === "KeyC" && actions.blank) return actions.blank(event.altKey), true
  // ⌥C: the card kept as a gem as well.
  if (event.altKey && !event.shiftKey && !event.metaKey && !event.ctrlKey && event.code === "KeyC" && actions.card) return actions.card(true), true
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  if (event.code === "KeyH") return actions.highlight(lastColor()), true
  if (event.code === "KeyK") return actions.keep(), true
  if (event.code === "KeyL") return actions.lookUp(), true
  if (event.code === "KeyC" && actions.card) return actions.card(false), true
  const digit = /^Digit([1-6])$/.exec(event.code)
  if (digit) return actions.highlight(MARK_COLORS[Number(digit[1]) - 1].id), true
  return false
}

/** The words every reader preview shows, before and after. */
const SAID = "Genocide is an attempt to destroy a people, in whole or in part."
const lit = (color: string): React.CSSProperties => ({ backgroundColor: `color-mix(in oklab, ${color} 32%, transparent)`, borderRadius: 2 })
const Before = ({ children }: { children: React.ReactNode }): React.JSX.Element => <p className="font-serif text-[11px] leading-snug">{children}</p>
const Arrow = (): React.JSX.Element => <div className="my-1 text-center text-[10px] text-muted-foreground">↓</div>

/**
 * The right-click menu's previews on picked words, as the slash menu has: a
 * tiny drawing of the words before and after, and one line on what it does.
 */
const READ_PEEKS: Record<string, MenuPeekEntry> = {
  highlight: { text: "**The words get a colour that stays on the page.** H uses the last colour; 1 to 5 pick one.", whole: true, art: () => (<><Before>{SAID}</Before><Arrow /><Before><span style={lit("var(--tt-color-text-yellow)")}>Genocide is an attempt</span> to destroy a people, in whole or in part.</Before></>) },
  keep: { text: "**The words become a gem, with the book and page they came from.** It comes back in Home and the Feed.", whole: true, art: () => (<MCard><p className="font-serif text-[11px] leading-snug">“Genocide is an attempt to destroy a people.”</p><p className="mt-1 text-[9.5px] text-muted-foreground">The Law Book, p. 82</p></MCard>) },
  card: { text: "**A question you write, with these words as its answer.** It comes up in Review.", whole: true, art: () => (<MCard><p className="text-[9px] text-muted-foreground">Question</p><p className="text-[10.5px] font-semibold">What is genocide?</p><div className="my-1 h-px bg-foreground/10" /><p className="text-[9px] text-muted-foreground">Answer</p><p className="font-serif text-[10.5px]">An attempt to destroy a people</p></MCard>) },
  blank: { text: "**The words blanked out of their sentence: a card that asks you to fill them in.**", whole: true, art: () => (<MCard><p className="font-serif text-[11px] leading-snug">Genocide is an attempt to <span className="inline-block w-12 border-b border-foreground/60 align-baseline" /> in whole or in part.</p><p className="mt-1 text-[9.5px] text-muted-foreground">Answer: destroy a people</p></MCard>) },
  later: { text: "**Mark words to turn into cards later, all at once.** “Make your marked cards” asks for each one.", whole: true, art: () => (<Before>Genocide is an attempt <span className="border-b border-dashed" style={{ borderColor: "var(--tt-brand-color-500, #c08a2e)" }}>to destroy a people</span>, in whole or in part.</Before>) },
  lookUp: { text: "**What the words mean, from the dictionary and Wikipedia,** under them on the page.", whole: true, art: () => (<><Before><span style={lit("var(--tt-color-text-blue)")}>Genocide</span> is an attempt…</Before><MCard className="mt-1"><p className="text-[10.5px] font-semibold">genocide <span className="font-normal italic text-muted-foreground">noun</span></p><p className="text-[10px]">The deliberate killing of a large number of people from one nation or group.</p></MCard></>) },
  cite: { text: "**Copied with where they came from,** ready to paste into an essay.", whole: true, art: () => (<MCard><p className="font-serif text-[11px] leading-snug">“Genocide is an attempt to destroy a people” (The Law Book, p. 82)</p></MCard>) },
  copy: { text: "**Just the words, copied as they are.**", whole: true, art: () => (<MCard><p className="font-serif text-[11px] leading-snug">Genocide is an attempt to destroy a people</p></MCard>) },
}

/** The right click's rows on picked words: everything that can be done with them, each with its key. */
export function PickedMenu({ actions }: { actions: ReadActions }): React.JSX.Element {
  const now = lastColor()
  return (
    <>
      <MenuPeek entries={READ_PEEKS} />
      <ContextMenuItem data-peek="highlight" onSelect={() => actions.highlight(now)}>
        <Highlighter style={{ color: markCss(now) }} />
        Highlight
        <ContextMenuShortcut>H</ContextMenuShortcut>
      </ContextMenuItem>
      <ColourRow on={undefined} onPick={actions.highlight} />
      <ContextMenuSeparator />
      <ContextMenuItem data-peek="keep" onSelect={actions.keep}>
        <Gem />
        Keep as a gem
        <ContextMenuShortcut>K</ContextMenuShortcut>
      </ContextMenuItem>
      {actions.card && (
        <ContextMenuItem data-peek="card" onSelect={() => actions.card?.()} title="A study card, in Review only; ⌥C keeps it as a gem too">
          <SquareStack />
          Make a card
          <ContextMenuShortcut>C</ContextMenuShortcut>
        </ContextMenuItem>
      )}
      {actions.blank && (
        <ContextMenuItem data-peek="blank" onSelect={() => actions.blank?.()} title="The words blanked out of their sentence, in Review only; ⌥⇧C keeps it as a gem too">
          <SquareDashed />
          Fill-in-the-blank card
          <ContextMenuShortcut>⇧C</ContextMenuShortcut>
        </ContextMenuItem>
      )}
      <ContextMenuItem data-peek="later" onSelect={() => actions.highlight("later")} title={LATER_TIP}>
        <SquareStack />
        Mark for a card
        <ContextMenuShortcut>6</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem data-peek="lookUp" onSelect={actions.lookUp}>
        <BookOpenText />
        Look up
        <ContextMenuShortcut>L</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem data-peek="cite" onSelect={actions.copy}>
        <Quote />
        Copy with citation
        <ContextMenuShortcut>⇧⌘C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem data-peek="copy" onSelect={() => void navigator.clipboard.writeText(getSelection()?.toString() ?? "")}>
        <Copy />
        Copy
        <ContextMenuShortcut>⌘C</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  )
}

/** The right click's rows on a highlight: its colour, its gem (made or opened), copy, remove. */
export function MarkMenu({ color, gem, onColor, onKeep, onOpenGem, onCopy, onRemove, onExtend, onTrim }: { color: string | null | undefined; gem: boolean; onColor: (color: MarkColor) => void; onKeep: () => void; onOpenGem: () => void; onCopy: () => void; onRemove: () => void; /** Words picked reaching past it: the highlight grown to hold them. */ onExtend?: () => void; /** Words picked inside it: the highlight cut to those words alone. */ onTrim?: () => void }): React.JSX.Element {
  return (
    <>
      {onExtend && (
        <ContextMenuItem onSelect={onExtend} title="The highlight grows to hold the words you picked">
          <Highlighter />
          Extend the highlight
        </ContextMenuItem>
      )}
      {onTrim && (
        <ContextMenuItem onSelect={onTrim} title="The highlight shrinks to the words you picked">
          <Highlighter />
          Keep just these words
        </ContextMenuItem>
      )}
      {(onExtend || onTrim) && <ContextMenuSeparator />}
      <ColourRow on={color ?? null} onPick={onColor} />
      <ContextMenuSeparator />
      {gem ? (
        <ContextMenuItem onSelect={onOpenGem}>
          <Gem />
          In a gem: Open
        </ContextMenuItem>
      ) : (
        <ContextMenuItem onSelect={onKeep}>
          <Gem />
          Keep as a gem
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={onCopy}>
        <Quote />
        Copy with citation
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={onRemove}>
        <Trash2 />
        {color === "later" ? "Remove the card mark" : "Remove highlight"}
      </ContextMenuItem>
    </>
  )
}

/** The colours as one row of swatches, as a list row's own menu shows its colours. */
function ColourRow({ on, onPick }: { on: string | null | undefined; onPick: (color: MarkColor) => void }): React.JSX.Element {
  return (
    <div role="group" aria-label="Highlight colour" className="flex items-center gap-1 px-1.5 py-1">
      {MARK_COLORS.map((one) => (
        <ContextMenuItem key={one.label} aria-label={one.id === "later" ? LATER_TIP : one.label} title={one.id === "later" ? `${LATER_TIP}  6` : one.label} aria-checked={one.id === on} role="menuitemradio" onSelect={() => onPick(one.id)} className="flex size-6 items-center justify-center rounded-md p-0 focus:bg-accent">
          <Swatch color={one.css} on={one.id === on} later={one.id === "later"} />
        </ContextMenuItem>
      ))}
    </div>
  )
}

/**
 * Right after words are kept as a gem, where they were: "Why keep this?" on
 * one line, focused, so a reason costs a few words and a Return. Esc, or
 * clicking away, leaves it unsaid: the book, page and words are kept anyway.
 * The reason is the gem's own thought, as any line written on a gem is.
 */
export function WhyAfter({ at, onSave, onDone, ask }: { at: { x: number; y: number; /** Where the picked words' last line ends: the field goes under it when the line above holds words. */ bottom?: number }; onSave: (why: string) => void; onDone: () => void; /** Asked for a card's question instead: what it says, and the line that says what is kept. */ ask?: { kept: string; label: string; placeholder: string } }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const place = usePlaced(box, at)
  const [why, setWhy] = useState("")
  return (
    <div ref={box} className="pdf-keep-bar pdf-why" style={place}>
      <Toolbar variant="floating">
        <span className="pdf-why-kept">
          {ask ? <SquareStack className="tiptap-button-icon" /> : <Gem className="tiptap-button-icon" />}
          {ask?.kept ?? "Kept"}
        </span>
        <input
          autoFocus
          className="pdf-why-field"
          type="text"
          aria-label={ask?.label ?? "Why keep this"}
          placeholder={ask?.placeholder ?? "Why keep this? (optional)"}
          value={why}
          onChange={(event) => setWhy(event.target.value)}
          onBlur={onDone}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              if (why.trim()) onSave(why.trim())
              onDone()
            } else if (event.key === "Escape") {
              event.preventDefault()
              onDone()
            }
          }}
        />
      </Toolbar>
    </div>
  )
}
