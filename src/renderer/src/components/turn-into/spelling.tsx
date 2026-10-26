import type { Editor } from "@tiptap/react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu"
import { host } from "@/lib/host"

/** A misspelt word in the document, where it sits, and what it might be. */
export interface Misspelling {
  word: string
  from: number
  to: number
  suggestions: string[]
}

/** Letters, with an apostrophe inside allowed: "don't" is one word. */
const WORD = /[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu

/**
 * The misspelt word under the pointer, if there is one.
 *
 * Asked of the same spellchecker that drew the squiggle, so a word is offered
 * here exactly when it is underlined. Nothing when spellcheck is off, the note
 * is locked, or the host has no spellchecker to ask.
 */
export function misspeltAt(editor: Editor, x: number, y: number): Misspelling | null {
  const check = host().misspelt
  if (!check || !editor.isEditable || !editor.view.dom.spellcheck) return null
  const found = editor.view.posAtCoords({ left: x, top: y })
  if (!found) return null
  const $pos = editor.state.doc.resolve(found.pos)
  if (!$pos.parent.isTextblock) return null
  // One character for each inline leaf, so offsets in the text are offsets in the block.
  const text = $pos.parent.textBetween(0, $pos.parent.content.size, undefined, "￼")
  for (const match of text.matchAll(WORD)) {
    const start = match.index
    if (start > $pos.parentOffset || $pos.parentOffset > start + match[0].length) continue
    const suggestions = check(match[0])
    if (!suggestions) return null
    const from = $pos.start() + start
    return { word: match[0], from, to: from + match[0].length, suggestions }
  }
  return null
}

/**
 * The spelling rows: up to five words it might be, from the page's own spellchecker (Chromium's, on every system).
 * Inside any of the editor's menus, which lend them their row styling.
 */
export function SpellingRows({ editor, spelling }: { editor: Editor; spelling: Misspelling }) {
  // A transaction rather than inserting content, so the word keeps its marks.
  const replace = (word: string) =>
    editor.chain().focus().command(({ tr }) => (tr.insertText(word, spelling.from, spelling.to), true)).run()
  return (
    <>
      <div className="tiptap-slash-menu-group">Spelling</div>
      {spelling.suggestions.slice(0, 5).map((word) => (
        <DropdownMenuItem key={word} asChild>
          <button type="button" onClick={() => replace(word)}>
            <span className="tiptap-slash-menu-title">{word}</span>
          </button>
        </DropdownMenuItem>
      ))}
      {spelling.suggestions.length ? null : (
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
