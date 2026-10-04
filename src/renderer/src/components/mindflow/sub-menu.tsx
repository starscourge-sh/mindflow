import { useEffect, useRef, useState } from "react"
import { useEditorState, type Editor } from "@tiptap/react"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { AlignCenterIcon } from "@/components/tiptap-icons/align-center-icon"
import { AlignLeftIcon } from "@/components/tiptap-icons/align-left-icon"
import { AlignRightIcon } from "@/components/tiptap-icons/align-right-icon"
import { SubscriptIcon } from "@/components/tiptap-icons/subscript-icon"
import { SuperscriptIcon } from "@/components/tiptap-icons/superscript-icon"
import { BoldIcon } from "@/components/tiptap-icons/bold-icon"
import { ItalicIcon } from "@/components/tiptap-icons/italic-icon"
import { UnderlineIcon } from "@/components/tiptap-icons/underline-icon"
import { StrikeIcon } from "@/components/tiptap-icons/strike-icon"
import { Code2Icon } from "@/components/tiptap-icons/code2-icon"

type Choice = { label: string; icon: React.ComponentType<{ className?: string }>; active: (editor: Editor) => boolean; apply: (editor: Editor) => void }

/**
 * Several settings of one thing behind one button: it shows the one in use,
 * and opens a small row of the rest beneath it. Drawn inside the selection
 * bar and never taking the focus, so the text stays selected and the bar
 * stays up while you choose (a Radix menu takes the focus, and the bar hides).
 */
function SubMenu({ editor, label, choices, fallback, plain = -1 }: { editor: Editor; label: string; choices: Choice[]; fallback: Choice["icon"]; plain?: number }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const current = useEditorState({ editor, selector: ({ editor }) => (editor ? choices.findIndex((one) => one.active(editor)) : -1) }) ?? -1
  const Icon = current >= 0 ? choices[current].icon : fallback
  // Gone on a click anywhere else, or Escape.
  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent): void => void (box.current?.contains(event.target as Node) || setOpen(false))
    const key = (event: KeyboardEvent): void => void (event.key === "Escape" && setOpen(false))
    window.addEventListener("mousedown", away, true)
    window.addEventListener("keydown", key, true)
    return () => {
      window.removeEventListener("mousedown", away, true)
      window.removeEventListener("keydown", key, true)
    }
  }, [open])
  return (
    <div ref={box} className="relative">
      <Button
        type="button"
        variant="ghost"
        // Lit when something other than the plain setting is in use.
        data-active-state={(current >= 0 && current !== plain) || open ? "on" : "off"}
        tabIndex={-1}
        aria-label={label}
        aria-expanded={open}
        tooltip={label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        <Icon className="tiptap-button-icon" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute top-full left-1/2 z-50 mt-1.5 flex -translate-x-1/2 gap-0.5 rounded-lg border bg-popover p-1 shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
        >
          {choices.map((one, index) => (
            <Button
              key={one.label}
              type="button"
              role="menuitem"
              variant="ghost"
              data-active-state={index === current ? "on" : "off"}
              tabIndex={-1}
              aria-label={one.label}
              tooltip={one.label}
              onClick={() => {
                one.apply(editor)
                setOpen(false)
              }}
            >
              <one.icon className="tiptap-button-icon" />
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Left, centre, right. */
export const AlignMenu = ({ editor }: { editor: Editor }): React.JSX.Element => (
  <SubMenu
    editor={editor}
    label="Alignment"
    fallback={AlignLeftIcon}
    plain={0}
    choices={(["left", "center", "right"] as const).map((align, i) => ({
      label: ["Align left", "Centre", "Align right"][i],
      icon: [AlignLeftIcon, AlignCenterIcon, AlignRightIcon][i],
      active: (editor) => (align === "left" ? !editor.isActive({ textAlign: "center" }) && !editor.isActive({ textAlign: "right" }) : editor.isActive({ textAlign: align })),
      apply: (editor) => void editor.chain().focus().setTextAlign(align).run(),
    }))}
  />
)

/** Raised or lowered text; picking the one in use takes it off. */
export const ScriptMenu = ({ editor }: { editor: Editor }): React.JSX.Element => (
  <SubMenu
    editor={editor}
    label="Superscript and subscript"
    fallback={SuperscriptIcon}
    choices={[
      { label: "Superscript", icon: SuperscriptIcon, active: (editor) => editor.isActive("superscript"), apply: (editor) => void editor.chain().focus().unsetSubscript().toggleSuperscript().run() },
      { label: "Subscript", icon: SubscriptIcon, active: (editor) => editor.isActive("subscript"), apply: (editor) => void editor.chain().focus().unsetSuperscript().toggleSubscript().run() },
    ]}
  />
)

/**
 * Bold, italic, underline, strike and code behind one button showing the one
 * in use. Each acts like its key: on the selection, or the word under the
 * caret when nothing is selected. Picking one in use takes it off.
 */
export const MarkMenu = ({ editor }: { editor: Editor }): React.JSX.Element => {
  const word = (type: string) => (editor: Editor) => {
    const commands = editor.commands as unknown as { toggleMarkOnWord?: (type: string) => boolean }
    if (commands.toggleMarkOnWord) void (editor.chain().focus().run(), commands.toggleMarkOnWord(type))
    else void editor.chain().focus().toggleMark(type).run()
  }
  const marks = [
    ["bold", "Bold", BoldIcon],
    ["italic", "Italic", ItalicIcon],
    ["underline", "Underline", UnderlineIcon],
    ["strike", "Strike", StrikeIcon],
    ["code", "Code", Code2Icon],
  ] as const
  return (
    <SubMenu
      editor={editor}
      label="Text style"
      fallback={BoldIcon}
      choices={marks.map(([type, label, icon]) => ({ label, icon, active: (editor) => editor.isActive(type), apply: word(type) }))}
    />
  )
}
