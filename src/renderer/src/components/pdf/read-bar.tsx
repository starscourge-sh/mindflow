import { useLayoutEffect, useRef, useState } from "react"
import { BookOpenText, Gem, Highlighter, Quote, Trash2 } from "lucide-react"
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
}

/** A swatch: a round of the colour, ticked when it is the one in use. */
function Swatch({ color, on }: { color: string; on: boolean }): React.JSX.Element {
  return (
    <span aria-hidden className="pdf-swatch" style={{ background: color }}>
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
export function ReadBar({ at, actions }: { at: { x: number; y: number }; actions: ReadActions }): React.JSX.Element {
  const bar = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => setWidth(bar.current?.offsetWidth ?? 0), [])
  const now = lastColor()
  return (
    <div
      ref={bar}
      className="pdf-keep-bar"
      style={{ left: Math.max(8, at.x - width / 2), top: Math.max(8, at.y - 48) }}
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
              <button key={one.label} type="button" className="pdf-swatch-button" aria-label={`Highlight ${one.label.toLowerCase()}`} title={`${one.label}  ${index + 1}`} onClick={() => actions.highlight(one.id)}>
                <Swatch color={one.css} on={one.id === now} />
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
 * highlights in the last colour, 1 to 5 in each colour, K keeps a gem, ⇧⌘C
 * copies with the citation. Says whether the key was one.
 */
export function readKey(event: KeyboardEvent, actions: ReadActions): boolean {
  const field = event.target instanceof HTMLElement && event.target.closest("input, textarea, [contenteditable=true]")
  if (field) return false
  if (event.metaKey && event.shiftKey && !event.altKey && !event.ctrlKey && event.code === "KeyC") return actions.copy(), true
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  if (event.code === "KeyH") return actions.highlight(lastColor()), true
  if (event.code === "KeyK") return actions.keep(), true
  if (event.code === "KeyL") return actions.lookUp(), true
  const digit = /^Digit([1-5])$/.exec(event.code)
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
        <ContextMenuItem key={one.label} aria-label={one.label} aria-checked={one.id === on} role="menuitemradio" onSelect={() => onPick(one.id)} className="flex size-6 items-center justify-center rounded-md p-0 focus:bg-accent">
          <Swatch color={one.css} on={one.id === on} />
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
export function WhyAfter({ at, onSave, onDone }: { at: { x: number; y: number }; onSave: (why: string) => void; onDone: () => void }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => setWidth(box.current?.offsetWidth ?? 0), [])
  const [why, setWhy] = useState("")
  return (
    <div ref={box} className="pdf-keep-bar pdf-why" style={{ left: Math.max(8, at.x - width / 2), top: Math.max(8, at.y - 48) }}>
      <Toolbar variant="floating">
        <span className="pdf-why-kept">
          <Gem className="tiptap-button-icon" />
          Kept
        </span>
        <input
          autoFocus
          className="pdf-why-field"
          type="text"
          aria-label="Why keep this"
          placeholder="Why keep this? (optional)"
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
