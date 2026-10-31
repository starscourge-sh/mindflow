import { useLayoutEffect, useRef, useState } from "react"
import { BookOpenText, Gem, Highlighter, Quote, SquareDashed, SquareStack, Trash2 } from "lucide-react"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/tiptap-ui-primitive/toolbar"
import { ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut } from "@/components/ui/context-menu"

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
  // Words to make a card of on the second read: the "Card later" walk asks for each.
  // Not a colour: a dashed underline in the book's colour and a tick in the
  // margin, so it is never taken for a highlight or a search match (violet).
  { id: "later", label: "Card later", css: "var(--tt-brand-color-500, #c08a2e)" },
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
  /** A card whose answer is the picked words: the question is asked where they were. */
  card?: () => void
  /** A fill-in-the-blank card: the sentence round the words, the words blanked. */
  blank?: () => void
}

/** What "Card later" does, said on its swatch wherever it shows. */
export const LATER_TIP = "Card later: make a card on the second read"

/** A swatch: a round of the colour, ticked when it is the one in use. */
function Swatch({ color, on, later = false }: { color: string; on: boolean; /** "Card later": drawn as its dashed underline, not a colour. */ later?: boolean }): React.JSX.Element {
  // "Card later" is not a colour: a little card over the dashed underline it leaves in the page, filled when it is the one in use.
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

export function ReadBar({ at, actions }: { at: { x: number; y: number; bottom?: number }; actions: ReadActions }): React.JSX.Element {
  const bar = useRef<HTMLDivElement>(null)
  const place = usePlaced(bar, at)
  const now = lastColor()
  return (
    <div
      ref={bar}
      className="pdf-keep-bar"
      style={place}
      // The words stay picked while the bar is pressed.
      onMouseDown={(event) => event.preventDefault()}
    >
      <Toolbar variant="floating">
        <ToolbarGroup>
          <Button data-style="ghost" aria-label="Highlight" title="Highlight  H" onClick={() => actions.highlight(now)}>
            <Highlighter className="tiptap-button-icon" style={{ color: markCss(now) }} />
            <span className="tiptap-button-text">Highlight</span>
          </Button>
          <span className="pdf-swatches" role="group" aria-label="Highlight in a colour">
            {MARK_COLORS.map((one, index) => (
              <button key={one.label} type="button" className="pdf-swatch-button" aria-label={one.id === "later" ? LATER_TIP : `Highlight ${one.label.toLowerCase()}`} title={one.id === "later" ? `${LATER_TIP}  ${index + 1}` : `${one.label}  ${index + 1}`} onClick={() => actions.highlight(one.id)}>
                <Swatch color={one.css} on={one.id === now} later={one.id === "later"} />
              </button>
            ))}
          </span>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <Button data-style="ghost" aria-label="Keep" title="Keep as a gem  K" onClick={actions.keep}>
            <Gem className="tiptap-button-icon" />
            <span className="tiptap-button-text">Keep</span>
          </Button>
          {actions.card && (
            <Button data-style="ghost" aria-label="Card" title="Make a card: these words answer it  C" onClick={actions.card}>
              <SquareStack className="tiptap-button-icon" />
              <span className="tiptap-button-text">Card</span>
            </Button>
          )}
          {actions.blank && (
            <Button data-style="ghost" aria-label="Blank" title="Fill-in-the-blank card from the sentence  ⇧C" onClick={actions.blank}>
              <SquareDashed className="tiptap-button-icon" />
            </Button>
          )}
          <Button data-style="ghost" aria-label="Look up" title="Look up  L" onClick={actions.lookUp}>
            <BookOpenText className="tiptap-button-icon" />
          </Button>
          <Button data-style="ghost" aria-label="Copy with citation" title="Copy with citation  ⇧⌘C" onClick={actions.copy}>
            <Quote className="tiptap-button-icon" />
          </Button>
        </ToolbarGroup>
      </Toolbar>
    </div>
  )
}

/**
 * The keys the bar shows, while words are picked in this reader: H
 * highlights in the last colour, 1 to 6 in each colour (6 is "Card later"), K keeps a gem, ⇧⌘C
 * copies with the citation. Says whether the key was one.
 */
export function readKey(event: KeyboardEvent, actions: ReadActions): boolean {
  const field = event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable=true]")
  if (field) return false
  if (event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey && event.code === "KeyC") return actions.copy(), true
  if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && event.code === "KeyC" && actions.blank) return actions.blank(), true
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  if (event.code === "KeyH") return actions.highlight(lastColor()), true
  if (event.code === "KeyK") return actions.keep(), true
  if (event.code === "KeyL") return actions.lookUp(), true
  if (event.code === "KeyC" && actions.card) return actions.card(), true
  const digit = /^Digit([1-6])$/.exec(event.code)
  if (digit) return actions.highlight(MARK_COLORS[Number(digit[1]) - 1].id), true
  return false
}

/** The right click's rows on picked words: what the bar offers, with the same keys. */
export function PickedMenu({ actions }: { actions: ReadActions }): React.JSX.Element {
  const now = lastColor()
  return (
    <>
      <ContextMenuItem onSelect={() => actions.highlight(now)}>
        <Highlighter style={{ color: markCss(now) }} />
        Highlight
        <ContextMenuShortcut>H</ContextMenuShortcut>
      </ContextMenuItem>
      <ColourRow on={undefined} onPick={actions.highlight} />
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={actions.keep}>
        <Gem />
        Keep as a gem
        <ContextMenuShortcut>K</ContextMenuShortcut>
      </ContextMenuItem>
      {actions.card && (
        <ContextMenuItem onSelect={actions.card}>
          <SquareStack />
          Make a card
          <ContextMenuShortcut>C</ContextMenuShortcut>
        </ContextMenuItem>
      )}
      {actions.blank && (
        <ContextMenuItem onSelect={actions.blank}>
          <SquareDashed />
          Fill-in-the-blank card
          <ContextMenuShortcut>⇧C</ContextMenuShortcut>
        </ContextMenuItem>
      )}
      <ContextMenuItem onSelect={actions.lookUp}>
        <BookOpenText />
        Look up
        <ContextMenuShortcut>L</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onSelect={actions.copy}>
        <Quote />
        Copy with citation
        <ContextMenuShortcut>⇧⌘C</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  )
}

/** The right click's rows on a highlight: its colour, its gem (made or opened), copy, remove. */
export function MarkMenu({ color, gem, onColor, onKeep, onOpenGem, onCopy, onRemove }: { color: string | null | undefined; gem: boolean; onColor: (color: MarkColor) => void; onKeep: () => void; onOpenGem: () => void; onCopy: () => void; onRemove: () => void }): React.JSX.Element {
  return (
    <>
      <ColourRow on={color ?? null} onPick={onColor} />
      <ContextMenuSeparator />
      {gem ? (
        <ContextMenuItem onSelect={onOpenGem}>
          <Gem />
          Open its gem
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
        Remove highlight
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
