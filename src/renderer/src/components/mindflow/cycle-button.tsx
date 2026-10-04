import { useEditorState, type Editor } from "@tiptap/react"

import { Button } from "@/components/tiptap-ui-primitive/button"
import { AlignCenterIcon } from "@/components/tiptap-icons/align-center-icon"
import { AlignLeftIcon } from "@/components/tiptap-icons/align-left-icon"
import { AlignRightIcon } from "@/components/tiptap-icons/align-right-icon"
import { SubscriptIcon } from "@/components/tiptap-icons/subscript-icon"
import { SuperscriptIcon } from "@/components/tiptap-icons/superscript-icon"

type State = { label: string; icon: React.ComponentType<{ className?: string }>; apply: (editor: Editor) => void }

/**
 * Several settings of one thing in one button: each click moves to the next,
 * and the icon shows where you are. Room on the selection bar, without a menu,
 * which would take focus and make the bar hide itself.
 */
function CycleButton({ editor, states, at }: { editor: Editor; states: State[]; at: (editor: Editor) => number }): React.JSX.Element {
  const index = useEditorState({ editor, selector: ({ editor }) => (editor ? at(editor) : 0) }) ?? 0
  const current = states[index]
  const next = states[(index + 1) % states.length]
  return (
    <Button
      type="button"
      variant="ghost"
      data-active-state={index > 0 ? "on" : "off"}
      tabIndex={-1}
      aria-label={`${current.label}. Click for ${next.label.toLowerCase()}`}
      tooltip={`${current.label} · click for ${next.label.toLowerCase()}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => next.apply(editor)}
    >
      <current.icon className="tiptap-button-icon" />
    </Button>
  )
}

/** Left, centre, right. */
export const AlignCycle = ({ editor }: { editor: Editor }): React.JSX.Element => (
  <CycleButton
    editor={editor}
    at={(editor) => (editor.isActive({ textAlign: "center" }) ? 1 : editor.isActive({ textAlign: "right" }) ? 2 : 0)}
    states={(["left", "center", "right"] as const).map((align, i) => ({
      label: ["Aligned left", "Centred", "Aligned right"][i],
      icon: [AlignLeftIcon, AlignCenterIcon, AlignRightIcon][i],
      apply: (editor) => void editor.chain().focus().setTextAlign(align).run(),
    }))}
  />
)

/** Normal, raised, lowered. */
export const ScriptCycle = ({ editor }: { editor: Editor }): React.JSX.Element => (
  <CycleButton
    editor={editor}
    at={(editor) => (editor.isActive("superscript") ? 1 : editor.isActive("subscript") ? 2 : 0)}
    states={[
      { label: "Normal text", icon: SuperscriptIcon, apply: (editor) => void editor.chain().focus().unsetSubscript().unsetSuperscript().run() },
      { label: "Superscript", icon: SuperscriptIcon, apply: (editor) => void editor.chain().focus().unsetSubscript().setSuperscript().run() },
      { label: "Subscript", icon: SubscriptIcon, apply: (editor) => void editor.chain().focus().unsetSuperscript().setSubscript().run() },
    ]}
  />
)
