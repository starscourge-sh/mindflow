import { useEffect, useRef, useState } from "react"
import { TextSelection } from "@tiptap/pm/state"
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { alive } from "@/components/ui/alive-icon"
import RightChevronIcon from "@/components/ui/right-chevron"

import { EmojiButton } from "@/components/emoji/emoji-button"
import { cue } from "@/lib/cues"

import type { BlockColor } from "@/extensions/block-color"

// itshover drawings in lucide's place, moving when their control is pointed at.
const ChevronRight = alive(RightChevronIcon)

/**
 * A tinted box with an icon you can change, and anything you like inside.
 * One from Obsidian has a title over it, and may fold away to that title.
 */
export function CalloutView(props: NodeViewProps): React.JSX.Element {
  const { icon, color, type, title, fold } = props.node.attrs as { icon: string; color: BlockColor; type: string; title: string; fold: string }
  const folded = fold === "-"
  const field = useRef<HTMLTextAreaElement>(null)
  // The words as typed, kept here while you type: read back from the node on
  // every keystroke, the caret jumped to the end whenever React caught up late.
  const [draft, setDraft] = useState(title)
  useEffect(() => {
    if (document.activeElement !== field.current) setDraft(title)
  }, [title])

  /** On into the body, at the start of its first line: unfolded, so the caret is somewhere you can see. */
  const intoBody = (): void => {
    const pos = props.getPos()
    if (pos == null) return
    const { editor } = props
    editor
      .chain()
      .command(({ tr }) => {
        if (folded) tr.setNodeAttribute(pos, "fold", "+")
        tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)))
        return true
      })
      .focus()
      .run()
    // A line to write on, in vim too.
    editor.commands.enterInsertMode?.()
  }

  return (
    <NodeViewWrapper className="tiptap-callout" data-accent={color} data-folded={folded || undefined}>
      <EmojiButton
        icon={icon}
        color={color}
        className="tiptap-callout-icon"
        onPick={props.updateAttributes}
      />
      {/* Kept while its words are cleared, so the field is still there to type in. */}
      {(type || title || fold) && (
        <div className="tiptap-callout-title" contentEditable={false}>
          {/* Its own small field, outside the document's text, the way a
              picture's caption is: the title is the node's, not a line in it. */}
          <textarea
            ref={field}
            className="tiptap-callout-title-text"
            rows={1}
            value={draft}
            readOnly={!props.editor.isEditable}
            spellCheck
            aria-label="Callout title"
            placeholder="Title"
            onChange={(event) => {
              // One line: a title pasted with breaks in it reads as one.
              const next = event.target.value.replace(/\s*\n\s*/g, " ")
              setDraft(next)
              props.updateAttributes({ title: next })
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              const end = event.currentTarget.selectionStart === event.currentTarget.value.length
              if ((event.key === "Enter" && !event.shiftKey) || (event.key === "ArrowDown" && end)) {
                event.preventDefault()
                intoBody()
              }
            }}
          />
          {fold && (
            <button
              type="button"
              className="tiptap-callout-fold"
              // Folding is a glance, not a move: the caret stays where it was.
              onMouseDown={(event) => event.preventDefault()}
              aria-label={folded ? "Show what is inside" : "Fold away"}
              aria-expanded={!folded}
              onClick={() => {
                cue(folded ? "unfold" : "fold")
                props.updateAttributes({ fold: folded ? "+" : "-" })
              }}
            >
              <ChevronRight />
            </button>
          )}
        </div>
      )}
      <NodeViewContent className="tiptap-callout-body" />
    </NodeViewWrapper>
  )
}
