import { useRef } from "react"
import type { CSSProperties } from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import { Fragment, Slice } from "@tiptap/pm/model"
import { Document } from "@tiptap/extension-document"
import { Paragraph } from "@tiptap/extension-paragraph"
import { Text } from "@tiptap/extension-text"
import { Bold } from "@tiptap/extension-bold"
import { Italic } from "@tiptap/extension-italic"
import { Code } from "@tiptap/extension-code"
import { Strike } from "@tiptap/extension-strike"
import { Placeholder, UndoRedo } from "@tiptap/extensions"

import { Tokens, findTokens, type TokenPattern, type TokenMatch } from "@/extensions/tokens"
import { VimMode } from "@/extensions/vim-mode"
import { SelectionMenu } from "@/components/selection/selection-menu"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { ToolbarGroup } from "@/components/tiptap-ui-primitive/toolbar"

// --- Styles ---
import "@/assets/styles/_variables.scss"
import "@/components/title/title-editor.scss"

/** What a title is allowed to be. Everything else is absent from the schema. */
const TITLE_MARKS = ["bold", "italic", "strike", "code"] as const

export interface TitleValue {
  /** What was typed, markers and all: "Pay rent !p1 #home". */
  text: string
  /** The same thing with its marks, for storing. */
  html: string
  /** Anything matching a `tokens` pattern, in the order it appears. */
  tokens: TokenMatch[]
}

/**
 * One line of rich text, for a task or a note title.
 *
 * The restriction is the schema, not a set of disabled buttons: headings, code
 * blocks, lists and the rest are not registered, so there is nothing to invoke
 * by shortcut, by markdown shortcut, or by pasting.
 *
 * The two variants differ only in how they are dressed - `note` is a document
 * heading with no chrome, `task` is a field in a prompt and carries a box. What
 * you can type is the same in both, which is the point of having one component.
 *
 * `defaultContent` is read once, at mount. To show a different title, remount
 * with a `key` rather than changing the prop.
 */
export function TitleEditor({
  variant = "note",
  defaultContent = "",
  placeholder = "Title",
  autofocus = variant === "task",
  tokens = [],
  vim = true,
  onChange,
  onSubmit,
}: {
  /** `note` is a document heading; `task` is a quick-capture field. */
  variant?: "note" | "task"
  defaultContent?: string
  placeholder?: string
  /** A prompt should take the caret; a note title should not steal it. */
  autofocus?: boolean
  /** Vim bindings, minus anything that needs more than one line. */
  vim?: boolean
  /**
   * Patterns to highlight as they are typed, and report back. Read once at
   * mount; remount with a `key` to change them.
   */
  tokens?: TokenPattern[]
  onChange?: (value: TitleValue) => void
  onSubmit?: () => void
}) {
  // Held from the first render: the extension captures its patterns when the
  // editor is built, so reading a newer prop here would report tokens that are
  // not the ones being highlighted.
  const patterns = useRef(tokens).current

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autofocus ? "end" : false,
    content: defaultContent,
    editorProps: {
      attributes: {
        class: "tiptap-title",
        "aria-label": placeholder,
      },
      // A title holds one paragraph, and ProseMirror will not fit two into it -
      // it drops the paste instead. Flatten to inline content so the text
      // arrives, with its marks, on the single line that is there.
      transformPasted: (slice, view) => {
        const space = Fragment.from(view.state.schema.text(" "))
        let flat = Fragment.empty
        slice.content.forEach((node) => {
          const part = node.isInline ? Fragment.from(node) : node.content
          flat = flat.size ? flat.append(space).append(part) : part
        })
        return new Slice(flat, 0, 0)
      },
    },
    extensions: [
      Document.extend({ content: "paragraph" }),
      Paragraph,
      Text,
      Bold,
      Italic,
      Code,
      Strike,
      UndoRedo,
      Tokens.configure({ patterns }),
      // The same bindings as the document, minus the ones that need a second
      // line. Motions, text objects, case changes and marks all carry over.
      VimMode.configure({ enabled: vim, singleLine: true }),
      Placeholder.configure({ placeholder }),
    ],
    onUpdate: ({ editor: instance }) =>
      onChange?.({
        text: instance.getText(),
        html: instance.getHTML(),
        tokens: findTokens(instance, patterns),
      }),
  })

  return (
    <div className={`tiptap-title-wrapper is-${variant} bg-background border-b`}>
      <div style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <SelectionMenu editor={editor}>
          <ToolbarGroup>
            {TITLE_MARKS.map((type) => (
              <MarkButton key={type} type={type} showTooltip={false} />
            ))}
          </ToolbarGroup>
        </SelectionMenu>
      </div>

      <EditorContent
        editor={editor}
        role="presentation"
        className="p-4"

        onKeyDown={(event) => {
          // An IME uses Enter to accept a candidate, so committing on it would
          // submit half-typed Japanese.
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return
          // There is no second line to break to, so Enter is the commit.
          event.preventDefault()
          onSubmit?.()
        }}
      />
    </div>
  )
}
