import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useEditorState, type Editor } from "@tiptap/react"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { AlignCenterIcon } from "@/components/tiptap-icons/align-center-icon"
import { AlignLeftIcon } from "@/components/tiptap-icons/align-left-icon"
import { AlignRightIcon } from "@/components/tiptap-icons/align-right-icon"
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"
import { SubscriptIcon } from "@/components/tiptap-icons/subscript-icon"
import { SuperscriptIcon } from "@/components/tiptap-icons/superscript-icon"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { markLabels, useMarkDropdownMenu } from "@/components/tiptap-ui/mark-dropdown-menu"
import { useColorHighlight } from "@/components/tiptap-ui/color-highlight-button"
import { ColorHighlightPopoverContent } from "@/components/tiptap-ui/color-highlight-popover"
import { openChime } from "@/lib/sound"

type Icon = React.ComponentType<{ className?: string }>
type Choice = { label: string; icon: Icon; active: (editor: Editor) => boolean; apply: (editor: Editor) => void }

/**
 * A button in the selection bar that opens a small panel beneath it (above
 * it, when there is no room below). It never takes the focus, so the text
 * stays selected and the bar stays up while you choose. A Radix menu or
 * popover takes the focus: the bar hides, which takes its button out of the
 * page, and the menu, anchored to a button no longer there, opened at the
 * window's top left corner.
 */
function BarMenu({ label, lit, icon: Shown, bare, column, children }: {
  label: string
  lit: boolean
  icon: Icon
  /** The panel draws no frame of its own: what it holds has one. */
  bare?: boolean
  /** A list of named choices, one under another, rather than a row of icons. */
  column?: boolean
  children: (close: () => void) => React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // One menu open at a time in the bar: opening this one closes the others, and theirs closes this.
  useEffect(() => {
    if (open) document.dispatchEvent(new CustomEvent("mf:menu", { detail: label }))
    const other = (event: Event): void => void ((event as CustomEvent<string>).detail !== label && setOpen(false))
    document.addEventListener("mf:menu", other)
    return () => document.removeEventListener("mf:menu", other)
  }, [open, label])
  const panel = useRef<HTMLDivElement | null>(null)
  // Placed on the page, not inside the bar, which clips what hangs off it:
  // beneath the button (above it with no room below), kept 8px inside the
  // window. Measured before it is painted, so it never shows anywhere else.
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || !box.current || !panel.current) return setAt(null)
    const button = box.current.getBoundingClientRect()
    const { offsetWidth: width, offsetHeight: height } = panel.current
    const left = Math.min(Math.max(8, column ? button.left : button.left + button.width / 2 - width / 2), window.innerWidth - width - 8)
    const below = button.bottom + 6
    const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, button.top - 6 - height)
    setAt({ left, top })
  }, [open, column])
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
        data-active-state={lit || open ? "on" : "off"}
        tabIndex={-1}
        aria-label={label}
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        <Shown className="tiptap-button-icon" />
        {column && <ChevronDownIcon className="tiptap-button-dropdown-small" />}
      </Button>
      {open && createPortal(
        <div
          ref={(node) => {
            panel.current = node
            openChime(node)
          }}
          role="menu"
          aria-label={label}
          className={`fixed z-[60] flex gap-0.5 ${column ? "flex-col items-stretch" : ""} ${bare ? "" : "rounded-lg border bg-popover p-1 shadow-(--mf-panel-shadow)"}`}
          style={{ left: at?.left ?? -9999, top: at?.top ?? -9999 }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {children(() => setOpen(false))}
        </div>,
        document.body
      )}
    </div>
  )
}

/** Several settings of one thing behind one button: it shows the one in use, and opens a row of the rest. */
function SubMenu({ editor, label, choices, fallback, plain = -1 }: { editor: Editor; label: string; choices: Choice[]; fallback: Icon; plain?: number }): React.JSX.Element {
  const current = useEditorState({ editor, selector: ({ editor }) => (editor ? choices.findIndex((one) => one.active(editor)) : -1) }) ?? -1
  return (
    // Lit when something other than the plain setting is in use.
    <BarMenu label={label} icon={current >= 0 ? choices[current].icon : fallback} lit={current >= 0 && current !== plain}>
      {(close) => choices.map((one, index) => (
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
            close()
          }}
        >
          <one.icon className="tiptap-button-icon" />
        </Button>
      ))}
    </BarMenu>
  )
}

const MARKS = ["bold", "italic", "strike", "underline"] as const

/** Bold, italic, strikethrough and underline behind one button, each by name. */
export const MarkMenu = ({ editor }: { editor: Editor }): React.JSX.Element => {
  const { isActive, Icon } = useMarkDropdownMenu({ editor, types: [...MARKS] })
  return (
    <BarMenu label="Format text" icon={Icon} lit={isActive} column>
      {(close) => MARKS.map((type) => (
        <MarkButton key={type} editor={editor} type={type} text={markLabels[type]} showTooltip={false} role="menuitem" className="justify-start" onClick={close} />
      ))}
    </BarMenu>
  )
}

/** The highlighter's colours, and taking a highlight off. */
export const HighlightMenu = ({ editor }: { editor: Editor }): React.JSX.Element => {
  const { isActive, label, Icon } = useColorHighlight({ editor })
  return (
    <BarMenu label={label || "Highlight"} icon={Icon} lit={isActive} bare>
      {() => <ColorHighlightPopoverContent editor={editor} />}
    </BarMenu>
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
      label: ["Align left", "Align centre", "Align right"][i],
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
