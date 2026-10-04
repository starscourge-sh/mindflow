import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useEditorState, type Editor } from "@tiptap/react"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { AlignCenterIcon } from "@/components/tiptap-icons/align-center-icon"
import { AlignLeftIcon } from "@/components/tiptap-icons/align-left-icon"
import { AlignRightIcon } from "@/components/tiptap-icons/align-right-icon"
import { SubscriptIcon } from "@/components/tiptap-icons/subscript-icon"
import { SuperscriptIcon } from "@/components/tiptap-icons/superscript-icon"

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
  const panel = useRef<HTMLDivElement>(null)
  // Placed on the page, not inside the bar, which clips what hangs off it:
  // beneath the button, kept 8px inside the window.
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  useEffect(() => {
    if (!open || !box.current) return setAt(null)
    const button = box.current.getBoundingClientRect()
    const width = panel.current?.offsetWidth ?? choices.length * 34 + 8
    const left = Math.min(Math.max(8, button.left + button.width / 2 - width / 2), window.innerWidth - width - 8)
    setAt({ left, top: button.bottom + 6 })
  }, [open, choices.length])
  const current = useEditorState({ editor, selector: ({ editor }) => (editor ? choices.findIndex((one) => one.active(editor)) : -1) }) ?? -1
  const Icon = current >= 0 ? choices[current].icon : fallback
  // Gone on a click anywhere else, or Escape.
  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent): void => void (box.current?.contains(event.target as Node) || panel.current?.contains(event.target as Node) || setOpen(false))
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
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        <Icon className="tiptap-button-icon" />
      </Button>
      {open && createPortal(
        <div
          ref={panel}
          role="menu"
          className="fixed z-[60] flex gap-0.5 rounded-lg border bg-popover p-1 shadow-(--mf-panel-shadow)"
          style={{ left: at?.left ?? -9999, top: at?.top ?? -9999 }}
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
              onClick={() => {
                one.apply(editor)
                setOpen(false)
              }}
            >
              <one.icon className="tiptap-button-icon" />
            </Button>
          ))}
        </div>,
        document.body
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

