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

/** The word under a point, and where it is in the document: null outside a word, or where spelling is off. */
export function wordAt(editor: Editor, x: number, y: number): { word: string; from: number; to: number } | null {
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
    return { word: match[0], from, to: from + match[0].length }
  }
  return null
}

/** Words always written with a capital: the days, the months (not "march", "may" or "august", which are words too), and "I" with its short forms. */
const CAPITALS = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|september|october|november|december|i|i'm|i've|i'll|i'd|i’m|i’ve|i’ll|i’d)$/

/**
 * What the spellchecker said of each word asked about so far: its fixes when misspelt, null when spelt right.
 * The asking never holds the window (host `spelling`, an answer that comes when it comes); what is known is read
 * at once, so a pill is placed and a menu drawn from here without waiting on anything.
 */
const said = new Map<string, string[] | null>()
const asked = new Map<string, Promise<string[] | null>>()
/** Ask about a word, once: its fixes when misspelt (maybe none), null when spelt right. */
export function spelling(word: string): Promise<string[] | null> {
  let found = asked.get(word)
  if (!found) {
    const ask = host().spelling
    found = (ask ? ask(word).catch(() => null) : Promise.resolve(null)).then((fixes) => {
      // A word always written with a capital ("monday", "i") counts as a slip even where the checker lets it by.
      const all = fixes ?? (CAPITALS.test(word) ? [word.charAt(0).toUpperCase() + word.slice(1)] : null)
      said.set(word, all)
      return all
    })
    asked.set(word, found)
  }
  return found
}

const misspelling = (here: { word: string; from: number; to: number }, fixes: string[]): Misspelling => {
  // A word written in lower case is most likely a lower-case word: those first, names ("Sligo" for "slsig") after.
  const lower = here.word === here.word.toLowerCase()
  return { ...here, suggestions: lower ? [...fixes.filter((one) => one === one.toLowerCase()), ...fixes.filter((one) => one !== one.toLowerCase())] : fixes }
}

/**
 * The misspelt word under a point, from what is already known: null when there is none (or spelling is off, the
 * note locked, no spellchecker to ask), and `undefined` when the word there has not been asked about yet
 * (`misspeltSoon` asks).
 */
export function misspeltAt(editor: Editor, x: number, y: number): Misspelling | null | undefined {
  if (!host().spelling) return null
  const here = wordAt(editor, x, y)
  if (!here) return null
  const fixes = said.get(here.word)
  return fixes ? misspelling(here, fixes) : said.has(here.word) ? null : undefined
}

/**
 * Every word of a short text asked about ahead (a sticky, quick capture, a card's answer), as the pointer comes
 * over it: a right-click there has to decide at once whether its word is misspelt, and then already knows.
 */
export function spellAhead(editor: Editor): void {
  if (!host().spelling || !editor.isEditable || !spellOn(editor)) return
  const text = editor.getText()
  if (text.length <= 5000) for (const word of new Set(text.match(WORD) ?? [])) void spelling(word)
}

/** The same, asked first where the word is new: answered as soon as the spellchecker has said. */
export async function misspeltSoon(editor: Editor, x: number, y: number): Promise<Misspelling | null> {
  if (!host().spelling) return null
  const here = wordAt(editor, x, y)
  if (!here) return null
  const fixes = await spelling(here.word)
  return fixes ? misspelling(here, fixes) : null
}

/**
 * The spelling rows: up to five words it might be, from the page's own spellchecker (Chromium's, on every system).
 * Inside any of the editor's menus, which lend them their row styling.
 */
export function SpellingRows({ editor, spelling }: { editor: Editor; spelling: Misspelling }) {
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
  return (
    <>
      <div className="tiptap-slash-menu-group">Spelling</div>
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
    </>
  )
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
