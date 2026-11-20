import type { Editor } from "@tiptap/react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu"
import { useEffect, useState } from "react"
import { host } from "@/lib/host"
import { spellFixes } from "@/lib/grammar"
import { domOf } from '@/lib/editor-dom'
import { toast } from "@/components/haligtree/ui"
import { MenuGlyph } from "@/components/ui/menu-icon"

/** A misspelt word in the document, where it sits, and what it might be. */
export interface Misspelling {
  word: string
  from: number
  to: number
  suggestions: string[]
}

/**
 * Whether spelling is on here: the editor's own attribute is set outright while
 * you type (no squiggles mid-word) and only put back on a pause, so the page
 * around it (Settings' switches, on the root or a place's wrapper) has the say.
 */
const spellOn = (editor: Editor): boolean => !!domOf(editor)?.spellcheck && domOf(editor)?.parentElement?.spellcheck !== false

/** Letters, with an apostrophe inside allowed: "don't" is one word. */
const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu

/** A word in the document, with the text round it that is asked about with it. */
export type Here = { word: string; from: number; to: number; /** Its block's text round it, and where the word starts in that. */ text: string; start: number }
/** How much of a long block goes with the word, either side: enough for the Mac to tell the language by. */
const AROUND = 500

/** The word under a point, and where it is in the document: null outside a word, or where spelling is off. */
export function wordAt(editor: Editor, x: number, y: number): Here | null {
  if (!editor.isEditable || !spellOn(editor)) return null
  const found = editor.view.posAtCoords({ left: x, top: y })
  if (!found) return null
  const $pos = editor.state.doc.resolve(found.pos)
  if (!$pos.parent.isTextblock) return null
  const text = $pos.parent.textBetween(0, $pos.parent.content.size, undefined, "￼")
  for (const match of text.matchAll(WORD)) {
    const start = match.index
    if (start > $pos.parentOffset || $pos.parentOffset > start + match[0].length) continue
    const from = $pos.start() + start
    // The whole block when it is short; of a long one the words round this one, cut at a space.
    let cut = Math.max(0, start - AROUND)
    let end = Math.min(text.length, start + match[0].length + AROUND)
    const space = cut > 0 ? text.indexOf(" ", cut) : -1
    if (space >= 0 && space < start) cut = space + 1
    if (end < text.length) end = Math.max(text.lastIndexOf(" ", end), start + match[0].length)
    return { word: match[0], from, to: from + match[0].length, text: text.slice(cut, end), start: start - cut }
  }
  return null
}

/** Words always written with a capital: the days, the months (not "march", "may" or "august", which are words too), and "I" with its short forms. */
const CAPITALS = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|september|october|november|december|i|i'm|i've|i'll|i'd|i’m|i’ve|i’ll|i’d)$/

/**
 * What the spellchecker said of each word asked about lately, where it stood: its fixes when misspelt, null when
 * spelt right. A word is asked with the text round it (the language is judged from the sentence), so what is kept
 * is kept for that word in that text. The asking never holds the window (host `spelling`, an answer that comes when
 * it comes); what is known is read at once, so the pill is placed from here without waiting on anything. Forgotten
 * whole when a word is learnt or unlearnt, in any window (main says so), and when it has grown long.
 */
const said = new Map<string, string[] | null>()
const asked = new Map<string, Promise<string[] | null>>()
const keyOf = (here: Here): string => `${here.start}:${here.word.length}:${here.text}`
/** Each thing that shows what was said (a pill) hears when it is forgotten, to ask again. */
const forgotten = new Set<() => void>()
export const onSpellingForgotten = (listen: () => void): (() => void) => (forgotten.add(listen), () => void forgotten.delete(listen))
const forget = (): void => (said.clear(), asked.clear(), forgotten.forEach((listen) => listen()))
if (typeof window !== "undefined") window.addEventListener("haligtree:spelling-changed", forget)

/** Ask about a word where it stands, once: its fixes when misspelt (maybe none), null when spelt right. */
export function spelling(here: Here): Promise<string[] | null> {
  const key = keyOf(here)
  const known = asked.get(key)
  if (known) return known
  if (asked.size > 400) (said.clear(), asked.clear())
  const ask = host().spelling
  const found: Promise<string[] | null> = (ask ? ask(here.text, here.start, here.word.length).catch(() => null) : Promise.resolve(null)).then((answer) => {
    // A word always written with a capital ("monday", "i") counts as a slip even where the checker lets it by.
    const all = answer?.flagged ? answer.guesses : CAPITALS.test(here.word) ? [here.word.charAt(0).toUpperCase() + here.word.slice(1)] : null
    // Only while this is still the asking that counts: one forgotten meanwhile (a word learnt) is not put back.
    if (asked.get(key) === found) said.set(key, all)
    return all
  })
  asked.set(key, found)
  return found
}

const misspelling = (here: Here, fixes: string[]): Misspelling => {
  // A word written in lower case is most likely a lower-case word: those first, names ("Sligo" for "slsig") after.
  const lower = here.word === here.word.toLowerCase()
  return { word: here.word, from: here.from, to: here.to, suggestions: lower ? [...fixes.filter((one) => one === one.toLowerCase()), ...fixes.filter((one) => one !== one.toLowerCase())] : fixes }
}

/**
 * The misspelt word under a point, from what is already known: null when there is none (or spelling is off, the
 * note locked, no spellchecker to ask), and `undefined` when the word there has not been asked about yet
 * (`misspeltSoon` asks). For the pill, which is placed again and again and must never wait.
 */
export function misspeltAt(editor: Editor, x: number, y: number): Misspelling | null | undefined {
  if (!host().spelling) return null
  const here = wordAt(editor, x, y)
  if (!here) return null
  const fixes = said.get(keyOf(here))
  return fixes ? misspelling(here, fixes) : said.has(keyOf(here)) ? null : undefined
}

/** The same, asked: answered as soon as the spellchecker has said (a few milliseconds; at once when already known). */
export async function misspeltSoon(editor: Editor, x: number, y: number): Promise<Misspelling | null> {
  if (!host().spelling) return null
  const here = wordAt(editor, x, y)
  if (!here) return null
  const fixes = await spelling(here)
  return fixes ? misspelling(here, fixes) : null
}

/** A right-click an editor has looked at and passed on: it leaves that one alone. */
const passed = new WeakSet<Event>()
export const passedOn = (event: Event): boolean => passed.has(event)

/**
 * A right-click on words that have no block menu (a sticky, quick capture, a card's answer), decided one way
 * everywhere: where it is on a word, the right-click is taken, the word asked about (a few milliseconds, never a
 * held window), and `decide` opens the editor's own menu for the answer, its spelling rows in it from its first
 * frame. Where the editor has no menu for it (`decide` says false), the right-click is passed on as if it had been
 * left alone: to whatever is behind the words on the page (a card's own menu), then to the window's own menu
 * where main draws one (a sticky's). Off a word there is nothing to ask, and it is decided at once.
 */
export function rightClickOnWords(editor: Editor, event: MouseEvent, decide: (found: Misspelling | null) => boolean): void {
  if (!host().spelling || !wordAt(editor, event.clientX, event.clientY)) return void (decide(null) && event.preventDefault())
  event.preventDefault()
  event.stopPropagation()
  const { target, clientX, clientY, screenX, screenY } = event
  void misspeltSoon(editor, clientX, clientY).then((found) => {
    if (decide(found) || !(target instanceof Node) || !target.isConnected) return
    const again = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, composed: true, view: window, button: 2, buttons: 2, clientX, clientY, screenX, screenY })
    passed.add(again)
    if (target.dispatchEvent(again)) host().ownMenu?.(clientX, clientY, window.getSelection()?.toString() ?? "")
  })
}

/**
 * The spelling rows: up to five words it might be, from the Mac's own spellchecker (the page's, on other systems),
 * then “Learn spelling” for a word that is right as written (a name, a term). Inside any of the editor's menus,
 * which lend them their row styling.
 */
export function SpellingRows({ editor, spelling, titled = true }: { editor: Editor; spelling: Misspelling; titled?: boolean }) {
  // Nothing from the page's checker (its list is short): Harper's dictionary, once loaded.
  const [more, setMore] = useState<string[]>([])
  useEffect(() => {
    if (spelling.suggestions.length || spelling.word !== spelling.word.toLowerCase()) return
    let gone = false
    void spellFixes(spelling.word).then((fixes) => !gone && setMore(fixes))
    return () => void (gone = true)
  }, [spelling.word, spelling.suggestions.length])
  const offered = spelling.suggestions.length ? spelling.suggestions : more
  // A transaction rather than inserting content, so the word keeps its marks.
  const replace = (word: string) =>
    editor.chain().focus().command(({ tr }) => (tr.insertText(word, spelling.from, spelling.to), true)).run()
  const learn = host().learnSpelling
  return (
    <>
      {/* Under "Spelling ›" the row it opens from already says so. */}
      {titled ? <div className="tiptap-slash-menu-group">Spelling</div> : null}
      {offered.slice(0, 5).map((word) => (
        <DropdownMenuItem key={word} asChild>
          <button type="button" onClick={() => replace(word)}>
            <span className="tiptap-slash-menu-title">{word}</span>
          </button>
        </DropdownMenuItem>
      ))}
      {offered.length ? null : (
        <div className="tiptap-slash-menu-group">No suggestions</div>
      )}
      {/* Not for a word the app itself asks a capital of ("monday"): learning it would change nothing here. */}
      {learn && !CAPITALS.test(spelling.word) ? (
        <DropdownMenuItem asChild>
          <button type="button" data-learn-spelling onClick={() => learnSpelling(spelling.word)}>
            <MenuGlyph label="Learn spelling" />
            <span className="tiptap-slash-menu-title">Learn spelling</span>
          </button>
        </DropdownMenuItem>
      ) : null}
    </>
  )
}

/**
 * “Learn spelling”: the word as written is right from now on, here and in every app on this Mac (it goes in the
 * Mac's own dictionary, as the Mac's “Learn Spelling” does). Said, with the way back.
 */
function learnSpelling(word: string): void {
  const learn = host().learnSpelling
  if (!learn) return
  void learn(word).then((done) => done && toast(`Learnt “${word}”: no longer marked as misspelt.`, () => void learn(word, false)))
}

/**
 * The same rows on their own, for an editor without block handles and so
 * without a block menu to put them in.
 */
export function SpellingMenu({
  editor,
  spelling,
  at,
  onClose,
}: {
  editor: Editor
  spelling: Misspelling | null
  at: { x: number; y: number } | null
  onClose: () => void
}) {
  return (
    <DropdownMenu modal={false} open={!!spelling && !!at} onOpenChange={(open) => open || onClose()}>
      <DropdownMenuTrigger asChild>
        <span
          className="tiptap-block-menu-anchor"
          // Against whatever box it sits in, as the block menu's anchor is:
          // a moved box is not the screen.
          ref={(node) => {
            if (!node || !at) return
            node.style.position = "absolute"
            const box = (node.offsetParent ?? document.body).getBoundingClientRect()
            node.style.left = `${at.x - box.left}px`
            node.style.top = `${at.y - box.top}px`
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="tiptap-block-menu">
        <div className="tiptap-block-menu-list">
          {spelling ? <SpellingRows editor={editor} spelling={spelling} /> : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
