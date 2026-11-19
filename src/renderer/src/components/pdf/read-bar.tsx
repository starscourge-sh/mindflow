import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { BookOpenText, Copy, Gem, Highlighter, Languages, Quote, Sparkles, SquareDashed, SquareStack, Trash2, Volume2 } from "lucide-react"
import { readToMe } from "@/lib/read-aloud"
import { translatable, translateWords } from "@/lib/translate"
import { capsNow, meets } from "@/lib/needs"
import { Toolbar } from "@/components/tiptap-ui-primitive/toolbar"
import { ContextMenuItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu"
import { menuIcon } from "@/components/ui/menu-icon-rules"
import { HELP_LINES, helpWords, type Away } from "@/components/haligtree/writing-help"
import { MenuPeek, type MenuPeekEntry } from "@/components/haligtree/menu-peeks"
import { MCard } from "@/components/haligtree/peek"
import { Pressed } from "@/components/haligtree/ui"
import { BLANK } from "@/lib/blanks"
import { chime } from "@/lib/sound"
import { quoted } from '../../../../main/clip'

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
export const cited = (quote: string, where: string): string => `${quoted(quote, 80)} (${where})`

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
  /** How this reader keeps a card or a quote Writing help wrote from the picked words (writing-help.tsx), as it keeps its own. */
  written?: Omit<Away, "rect">
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
 * Where a field floats over the picked words: on the page they are on (a PDF's sheet, an article's column), never
 * over the grey margin beside it, and clear of every line of words: above the picked words when that is clear, else
 * under the picked line, else the nearest clear place out from there. Measured and placed before the first paint
 * (a layout effect), and `placed` says when: the field is focused only then, without scrolling, so the pane never
 * scrolls to where it was first drawn (the last try drew it at the pane's corner, focused, and the pane jumped there,
 * taking the picked words out from under the next click).
 */
function usePlaced(box: React.RefObject<HTMLDivElement | null>, at: { x: number; y: number; bottom?: number }): { style: React.CSSProperties; placed: boolean } {
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    const pane = el?.parentElement
    if (!el || !pane) return
    const width = el.offsetWidth
    const height = el.offsetHeight
    // The pane's own coordinates (what at is given in) as the screen has them.
    const drawn = el.getBoundingClientRect()
    const ox = drawn.left - el.offsetLeft
    const oy = drawn.top - el.offsetTop
    const pages = [...pane.querySelectorAll<HTMLElement>(".pdf-page, .web-reader-body")].map((one) => ({ one, r: one.getBoundingClientRect() }))
    const page = pages.find(({ r }) => r.top - oy <= at.y && r.bottom - oy >= at.y)
    const lo = (page ? page.r.left - ox : 0) + 8
    const hi = (page ? page.r.right - ox : pane.clientWidth) - width - 8
    const left = hi >= lo ? Math.max(lo, Math.min(at.x - width / 2, hi)) : Math.max(8, Math.min(at.x - width / 2, pane.clientWidth - width - 8))
    // The words it would sit on: a PDF's text pieces, an article's lines (measured as drawn, line by line).
    const pieces = [...(page?.one ?? pane).querySelectorAll(".textLayer span, .web-reader-body :is(p, li, h1, h2, h3, h4, h5, h6, blockquote, figcaption, td)")]
    const hides = (top: number): boolean => {
      const r = { left: ox + left, right: ox + left + width, top: oy + top, bottom: oy + top + height }
      return pieces.some((one) => {
        if (!one.textContent?.trim() || one.querySelector(".textLayer span, p")) return false
        const range = document.createRange()
        range.selectNodeContents(one)
        return [...range.getClientRects()].some((line) => line.width && line.left < r.right && line.right > r.left && line.top < r.bottom && line.bottom > r.top)
      })
    }
    const above = at.y - height - 8
    const below = (at.bottom ?? at.y) + 8
    const top0 = page ? page.r.top - oy + 8 : 8
    const foot = page ? page.r.bottom - oy - height - 8 : Infinity
    const tries = [above, below, ...Array.from({ length: 30 }, (_, n) => [above - (n + 1) * 8, below + (n + 1) * 8]).flat()]
    const clear = at.bottom === undefined ? undefined : tries.find((top) => top >= top0 && top <= foot && !hides(top))
    setPlace({ left, top: clear ?? (at.bottom === undefined || above >= top0 ? Math.max(top0, above) : below) })
  }, [box, at.x, at.y, at.bottom])
  // Before it is measured: unseen, by the words (never the pane's corner), so nothing moves for it.
  return { style: place ?? { left: Math.max(8, at.x - 160), top: Math.max(8, at.y - 48), opacity: 0 }, placed: !!place }
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

/** The picked words a menu acts on, as the reader knows them: its previews show these, never made-up ones. */
export type Picked = { words: string; sentence: string; where: string; /** Who wrote it, when the source says. */ by?: string }

/** A fill-in-the-blank card of picked words: their sentence with them blanked; picked across two sentences, the words asked plainly. */
export function blankOf({ words, sentence, where }: Picked): { asked: string; answer: string } {
  const inIt = sentence.includes(words)
  return { asked: inIt && sentence !== words ? sentence.replace(words, BLANK) : `${BLANK} (${where})`, answer: inIt ? sentence : words }
}

/** Cut at a word, with "…", so a long pick still fits its little card. */
const short = (text: string, most = 120): string => (text.length <= most ? text : `${text.slice(0, most).replace(/\s+\S*$/, "")}…`)
/** The sentence round the words: [before, the words, after], each side cut to a few words. */
function around({ words, sentence }: Picked): [string, string, string] {
  const at = sentence.indexOf(words)
  if (at < 0) return ["", short(words), ""]
  const before = sentence.slice(0, at)
  const after = sentence.slice(at + words.length)
  return [before.length > 50 ? `…${before.slice(-50).replace(/^\S*\s+/, "")}` : before, short(words), after.length > 50 ? `${after.slice(0, 50).replace(/\s+\S*$/, "")}…` : after]
}
const lit = (color: string): React.CSSProperties => ({ backgroundColor: `color-mix(in oklab, ${color} 32%, transparent)`, borderRadius: 2 })
const Before = ({ children }: { children: React.ReactNode }): React.JSX.Element => <p className="font-serif text-[11px] leading-snug">{children}</p>
const Arrow = (): React.JSX.Element => <div className="my-1 text-center text-[10px] text-muted-foreground">↓</div>
/** The picked words in their sentence, the words drawn as the action leaves them. */
function Words({ picked, style, className }: { picked: Picked; style?: React.CSSProperties; className?: string }): React.JSX.Element {
  const [before, words, after] = around(picked)
  return <Before>{before}<span style={style} className={className}>{words}</span>{after}</Before>
}
const Gap = (): React.JSX.Element => <span className="inline-block w-12 border-b border-foreground/60 align-baseline" />
const Also = ({ keys }: { keys: string }): React.JSX.Element => <><Pressed keys={keys} /> keeps it as a gem too</>

/**
 * The right-click menu's previews on picked words, as the slash menu has: a
 * tiny drawing of these very words before and after, and one line on what it
 * does. Any other words a row needs (⌥C) go in its card's foot: a menu row has no tip.
 */
function readPeeks(picked: Picked, keyed = true): Record<string, MenuPeekEntry> {
  const [before, words, after] = around(picked)
  const [ask, rest] = blankOf(picked).asked.split(BLANK)
  const where = [picked.by, picked.where].filter(Boolean).join(", ")
  const colours = Object.fromEntries(MARK_COLORS.filter((one) => one.id !== "later").map((one, i): [string, MenuPeekEntry] => [`colour-${one.id ?? "book"}`, {
    text: `**Highlight in ${one.id ? one.label.toLowerCase() : "the book's colour"}.** The words keep it on the page.`, keys: String(i + 1), whole: true, fit: true,
    art: () => <Words picked={picked} style={lit(one.css)} />,
  }]))
  const all: Record<string, MenuPeekEntry> = {
    ...colours,
    highlight: { text: "**The words get a colour that stays on the page.** H uses the last colour; 1 to 5 pick one.", whole: true, fit: true, art: () => (<><Before>{before}{words}{after}</Before><Arrow /><Words picked={picked} style={lit(markCss(lastColor()))} /></>) },
    keep: { text: "**The words become a gem, with where they came from.** It comes back in Home and the Feed.", keys: "K", whole: true, fit: true, art: () => (<MCard><p className="font-serif text-[11px] leading-snug">{quoted(words, 80)}</p><p className="mt-1 text-[9.5px] text-muted-foreground">{picked.where}</p></MCard>) },
    card: { text: "**A question you write, with these words as its answer.** A study card: it comes up in Review only.", keys: "C", foot: <Also keys="⌥C" />, whole: true, fit: true, art: () => (<MCard><p className="text-[9px] text-muted-foreground">Question</p><p className="text-[10.5px] italic text-muted-foreground">The one you write next</p><div className="my-1 h-px bg-foreground/10" /><p className="text-[9px] text-muted-foreground">Answer</p><p className="font-serif text-[10.5px]">{words}</p></MCard>) },
    blank: { text: "**The words blanked out of their sentence: a card that asks you to fill them in.** In Review only.", keys: "⇧C", foot: <Also keys="⌥⇧C" />, whole: true, fit: true, art: () => (<MCard><p className="font-serif text-[11px] leading-snug">{ask.length > 60 ? `…${ask.slice(-60).replace(/^\S*\s+/, "")}` : ask}<Gap />{short(rest ?? "", 50)}</p><p className="mt-1 text-[9.5px] text-muted-foreground">Answer: {words}</p></MCard>) },
    later: { text: "**Mark words to turn into cards later, all at once.** “Make your marked cards” asks for each.", keys: "6", whole: true, fit: true, art: () => <Words picked={picked} className="border-b border-dashed" style={{ borderColor: "var(--tt-brand-color-500, #c08a2e)" }} /> },
    cite: { text: "**Copied with where they came from,** ready to paste into an essay.", keys: "⇧⌘C", whole: true, fit: true, art: () => (<MCard><p className="font-serif text-[11px] leading-snug">{quoted(words, 80)} ({where})</p></MCard>) },
    copy: { text: "**Just the words, copied as they are.**", keys: "⌘C", whole: true, fit: true, art: () => (<MCard><p className="font-serif text-[11px] leading-snug">{words}</p></MCard>) },
  }
  // A highlight's own menu has no keys (they act on picked words): its cards show none.
  return keyed ? all : Object.fromEntries(Object.entries(all).map(([id, one]) => [id, { ...one, keys: undefined, foot: undefined }]))
}

/** The right click's rows on picked words: everything that can be done with them, each with its key. `about` says which words, read once as the menu opens. */
export function PickedMenu({ actions, about }: { actions: ReadActions; about: () => Picked }): React.JSX.Element {
  const now = lastColor()
  const [peeks] = useState(() => readPeeks(about()))
  const makeCard = (): void => {
    if (!actions.written || !meets(capsNow(), "ai")) return actions.card?.()
    const range = getSelection()?.rangeCount ? getSelection()!.getRangeAt(0).getBoundingClientRect() : null
    helpWords("card", about().words, { ...actions.written, rect: range ?? { left: innerWidth / 2 - 180, top: innerHeight / 3, bottom: innerHeight / 3 } })
  }
  return (
    <>
      <MenuPeek entries={peeks} />
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
      {/* One line for making a card (the user, 18 Nov: four lines did it): a press makes the card, as C does; its other
          ways wait beside it, each with its own key still. Where the Mac has Apple Intelligence, the question is its,
          shown by the words to keep with ↵ (writing-help.tsx); Writing help keeps no copy of it. */}
      {actions.card ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger data-peek="card" data-make-card onClick={makeCard}>
            <SquareStack />
            Make a card
            <ContextMenuShortcut>C</ContextMenuShortcut>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-60">
            <ContextMenuItem data-card-way="question" onSelect={makeCard}>
              <SquareStack />
              Question and answer
              <ContextMenuShortcut>C</ContextMenuShortcut>
            </ContextMenuItem>
            {actions.blank && (
              <ContextMenuItem data-card-way="blank" onSelect={() => actions.blank?.()}>
                <SquareDashed />
                Fill in the blank
                <ContextMenuShortcut>⇧C</ContextMenuShortcut>
              </ContextMenuItem>
            )}
            <ContextMenuItem data-card-way="later" onSelect={() => actions.highlight("later")}>
              <SquareStack />
              Mark it, to make it later
              <ContextMenuShortcut>6</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : (
        <ContextMenuItem data-peek="later" onSelect={() => actions.highlight("later")}>
          <SquareStack />
          Mark for a card
          <ContextMenuShortcut>6</ContextMenuShortcut>
        </ContextMenuItem>
      )}
      {/* No preview: Look up opens its own card in place, and a preview over it fought with it. */}
      <ContextMenuItem onSelect={actions.lookUp}>
        <BookOpenText />
        Look up
        <ContextMenuShortcut>L</ContextMenuShortcut>
      </ContextMenuItem>
      {/* The words picked, aloud in the Mac's voice (every Mac), or in your own language (macOS 26 only). */}
      <ContextMenuItem data-read-aloud onSelect={() => void readToMe(about().words, getSelection()?.anchorNode?.parentElement?.closest('.pdf-reader, .web-reader, [data-pane]') ?? null)}>
        <Volume2 />
        Read aloud
      </ContextMenuItem>
      {translatable(about().words) && (
        <ContextMenuItem data-translate data-mac-needs="macos26" onSelect={() => void translateWords(about().words)}>
          <Languages />
          Translate
        </ContextMenuItem>
      )}
      {/* Apple Intelligence on this Mac, as a note's Writing help: only what keeps something, a book's words never change. */}
      {actions.written && meets(capsNow(), "ai") && (
        <ContextMenuSub>
          <ContextMenuSubTrigger data-writing-help-menu data-mac-needs="ai">
            <Sparkles />
            Writing help
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {HELP_LINES.filter((one) => !one.edits).map((one) => {
              const Icon = menuIcon(one.label)
              return (
                <ContextMenuItem key={one.id} data-help={one.id} onSelect={() => {
                  const range = getSelection()?.rangeCount ? getSelection()!.getRangeAt(0).getBoundingClientRect() : null
                  helpWords(one.id, about().words, { ...actions.written!, rect: range ?? { left: innerWidth / 2 - 180, top: innerHeight / 3, bottom: innerHeight / 3 } })
                }}>
                  <Icon />
                  {one.label}
                </ContextMenuItem>
              )
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
      )}
      <ContextMenuItem data-peek="cite" onSelect={actions.copy}>
        <Quote />
        Copy with citation
        <ContextMenuShortcut>⇧⌘C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem data-peek="copy" onSelect={() => void navigator.clipboard.writeText(getSelection()?.toString() ?? "").then(() => chime("copy"))}>
        <Copy />
        Copy
        <ContextMenuShortcut>⌘C</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  )
}

/**
 * The right click's rows on a highlight: its colour, its gem (made or opened), copy, remove.
 * `about`: its words, for its swatches' previews; left out when picked words share the menu (theirs show).
 */
export function MarkMenu({ color, gem, about, onColor, onKeep, onOpenGem, onCopy, onRemove, onExtend, onTrim }: { color: string | null | undefined; gem: boolean; about?: () => Picked; onColor: (color: MarkColor) => void; onKeep: () => void; onOpenGem: () => void; onCopy: () => void; onRemove: () => void; /** Words picked reaching past it: the highlight grown to hold them. */ onExtend?: () => void; /** Words picked inside it: the highlight cut to those words alone. */ onTrim?: () => void }): React.JSX.Element {
  const [peeks] = useState(() => (about ? readPeeks(about(), false) : null))
  return (
    <>
      {peeks && <MenuPeek entries={peeks} />}
      {onExtend && (
        <ContextMenuItem onSelect={onExtend}>
          <Highlighter />
          Extend the highlight
        </ContextMenuItem>
      )}
      {onTrim && (
        <ContextMenuItem onSelect={onTrim}>
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

/** The colours as one row of swatches, as a list row's own menu shows its colours. Each is named by its preview card, never a tip. */
function ColourRow({ on, onPick }: { on: string | null | undefined; onPick: (color: MarkColor) => void }): React.JSX.Element {
  return (
    <div role="group" aria-label="Highlight colour" className="flex items-center gap-1 px-1.5 py-1">
      {MARK_COLORS.map((one) => (
        <ContextMenuItem key={one.label} data-peek={one.id === "later" ? "later" : `colour-${one.id ?? "book"}`} aria-label={one.id === "later" ? LATER_TIP : one.label} aria-checked={one.id === on} role="menuitemradio" onSelect={() => onPick(one.id)} className="flex size-6 items-center justify-center rounded-md p-0 focus:bg-accent">
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
  const field = useRef<HTMLInputElement>(null)
  const { style, placed } = usePlaced(box, at)
  const [why, setWhy] = useState("")
  // Focused once it is in its place, and without scrolling the pane to it.
  useEffect(() => { if (placed) field.current?.focus({ preventScroll: true }) }, [placed])
  return (
    <div ref={box} className="pdf-keep-bar pdf-why" style={style}>
      <Toolbar variant="floating">
        <span className="pdf-why-kept">
          {ask ? <SquareStack className="tiptap-button-icon" /> : <Gem className="tiptap-button-icon" />}
          {ask?.kept ?? "Kept"}
        </span>
        <input
          ref={field}
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
