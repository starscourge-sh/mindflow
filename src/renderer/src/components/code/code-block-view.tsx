import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Minimize2 } from "lucide-react"
import { NodeViewContent, NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react"

// --- Icons ---

// --- Lib ---
import { detectLanguage, useGrammars } from "@/lib/lowlight"
import { said } from "@/lib/host"
import { CheckIcon } from "@/components/tiptap-icons/check-icon"
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu"
import { Copy as CopyIcon } from "@/components/ui/icons"
import ExpandIcon from "@/components/ui/expand-icon"
import { AliveIcon } from "@/components/ui/alive-icon"
import { Tip } from "@/components/haligtree/ui"
import { chime } from "@/lib/sound"
import { growFrom } from "@/lib/motion"

/**
 * Offered in the picker. The empty value is auto-detect, which is what the
 * extension does whenever the language attribute is unset.
 */
const LANGUAGES: [value: string, label: string][] = [
  ["", "Auto detect"],
  ["plaintext", "Plain text"],
  ["bash", "Bash"],
  ["c", "C"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["css", "CSS"],
  ["go", "Go"],
  ["java", "Java"],
  ["javascript", "JavaScript"],
  ["json", "JSON"],
  ["markdown", "Markdown"],
  ["python", "Python"],
  ["rust", "Rust"],
  ["sql", "SQL"],
  ["typescript", "TypeScript"],
  ["xml", "HTML / XML"],
  ["yaml", "YAML"],
]


/** The drawn diagram, or why it could not be drawn (keeping the last good drawing). */
type Drawn = { svg: string | null; error: string | null }

/**
 * A Mermaid diagram, drawn by Pele (loaded only when a note has one) in the
 * theme's own colours and type, set by CSS variables on `.mf-diagram`. The
 * words show only while the caret is in them: click the drawing to edit, the
 * drawing follows as you type, and Esc (the extension's key) steps out below.
 * Kept as a ```mermaid code block, so Markdown and Obsidian read it as theirs.
 */
export function DiagramView({ node, editor, getPos }: NodeViewProps): React.JSX.Element {
  const code = node.textContent
  const editing = useEditorState({
    editor,
    selector: ({ editor: one }) => {
      const at = typeof getPos === "function" ? getPos() : undefined
      if (at == null || !one) return false
      const { from, to } = one.state.selection
      return from > at && to < at + node.nodeSize
    },
  })
  const [drawn, setDrawn] = useState<Drawn>({ svg: null, error: null })
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!code.trim()) return
    let live = true
    // Measured in the note's own face, so each box fits its words.
    const fontFamily = box.current ? getComputedStyle(box.current).fontFamily : undefined
    import("pele/lazy")
      .then(({ renderAsync }) => renderAsync(code, { links: false, images: false, fontFamily }))
      .then(
        ({ svg }) => live && setDrawn({ svg, error: null }),
        (error: unknown) => live && setDrawn((was) => ({ svg: was.svg, error: error instanceof Error ? error.message : String(error) }))
      )
    return () => {
      live = false
    }
  }, [code])

  /**
   * Into the words, at their end. On click, not on press: ProseMirror picks
   * the whole block on the way up from a press on a part it cannot edit, and
   * that came after (and undid) a caret placed on the press.
   */
  const edit = (): void => {
    if (!editor.isEditable) return
    const at = typeof getPos === "function" ? getPos() : undefined
    if (at == null) return
    editor.chain().focus().setTextSelection(at + 1 + node.content.size).run()
  }

  const empty = !code.trim()
  const drawing = drawn.svg && !empty ? <div className="mf-diagram-drawing" dangerouslySetInnerHTML={{ __html: drawn.svg }} /> : null
  return (
    <NodeViewWrapper className="tiptap-code-block mf-diagram-block" data-editing={editing || empty || undefined} data-takes-escape="">
      <pre spellCheck={false}>
        <NodeViewContent as={"code" as "div"} />
      </pre>
      <div ref={box} className="mf-diagram" contentEditable={false} onMouseDown={(event) => event.preventDefault()} onClick={edit}>
        {drawing}
        {empty ? (
          <p className="mf-diagram-note"><b>An empty diagram.</b> Write Mermaid above it, such as “flowchart LR” and “A --&gt; B”.</p>
        ) : drawn.error ? (
          <p className="mf-diagram-note"><b>Not drawn yet.</b> {plainError(drawn.error)}</p>
        ) : null}
        {drawing && <FullScreen code={code} from={box} />}
      </div>
    </NodeViewWrapper>
  )
}

/**
 * A diagram filling the window, as a drawing's full screen does: it grows out
 * of the block, pinch or scroll zooms and a drag moves it (Pele's own zoom),
 * Esc or the button shrinks it back.
 */
function FullScreen({ code, from }: { code: string; from: React.RefObject<HTMLDivElement | null> }) {
  const [full, setFull] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const toggle = (): void => {
    chime(full ? "fold" : "slide")
    setFull(!full)
  }

  useLayoutEffect(() => {
    const start = from.current?.getBoundingClientRect()
    if (full && frame.current && start) growFrom(frame.current, start)
  }, [full])

  useEffect(() => {
    if (!full || !stage.current) return
    // Drawn afresh by Pele's own mount at the size it has in the note, as a
    // drawing opens at 100%, with Pele's zoom: pinch or ⌘-scroll, drag to move.
    let mounted: { destroy: () => void } | null = null
    let live = true
    const element = stage.current
    void import("pele/lazy").then(async ({ mountAsync }) => {
      if (!live) return
      const fontFamily = from.current ? getComputedStyle(from.current).fontFamily : undefined
      const one = await mountAsync(element, code, { links: false, images: false, fontFamily, zoom: { always: true, controls: false, maxScale: 8 } })
      if (!live) return one.destroy()
      mounted = one
    })
    // Esc leaves full screen, never the note or the window under it.
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      toggle()
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      live = false
      mounted?.destroy()
      window.removeEventListener("keydown", onKey, true)
    }
  }, [full])

  const button = (
    <Tip label={full ? "Leave full screen  Esc" : "Full screen"}>
      <button
        type="button"
        className="mf-diagram-full-button"
        aria-label={full ? "Leave full screen" : "Open in full screen"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation()
          toggle()
        }}
      >
        {full ? <Minimize2 className="size-4" /> : <AliveIcon icon={ExpandIcon} size={14} />}
      </button>
    </Tip>
  )

  return (
    <>
      {button}
      {full &&
        createPortal(
          // A portal still bubbles React events to the block, whose click opens the words.
          <div ref={frame} className="mf-diagram mf-diagram-full" role="dialog" aria-label="Diagram, full screen" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
            <div ref={stage} className="mf-diagram-stage" />
            {button}
          </div>,
          document.body
        )}
    </>
  )
}

/** A parser's message in plain words: which line, never "Expecting NODE_STRING". */
function plainError(message: string): string {
  const line = /line (\d+)/i.exec(message)?.[1]
  return line ? `Line ${line} is not finished, or has a mistake in it.` : "Mermaid cannot read it yet."
}

/**
 * The language picker and the copy button, top right of a code block. Drawn
 * only once the pointer first comes over the block (code-block-node-view.ts):
 * they show only on hover, and a note with 150 code blocks drew 150 menus.
 */
export function CodeControls({ language, code, setLanguage }: { language: string; code: string; setLanguage: (value: string | null) => void }): React.JSX.Element {
  const [copied, setCopied] = useState(false)

  // Only worth running while the block is on auto, and only when the code
  // changes - scoring 37 grammars on every keystroke is not free.
  // And once more when the grammars arrive, a moment after the note opens.
  const grammars = useGrammars()
  const detected = useMemo(
    () => (language || !grammars ? "" : detectLanguage(code)),
    [language, code, grammars]
  )

  const label =
    LANGUAGES.find(([value]) => value === language)?.[1] ?? language
  // Nothing detected is no "Auto · …": the empty value is "Auto detect" itself, and a block with its
  // language set said "Auto · Auto detect" instead of its language.
  const detectedLabel = detected
    ? (LANGUAGES.find(([value]) => value === detected)?.[1] ?? detected)
    : ""

  // A copy that says nothing looks like a copy that failed.
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" showTooltip={false}>
            <span className="tiptap-button-text">
              {detectedLabel ? `Auto · ${detectedLabel}` : label}
            </span>
            <ChevronDownIcon className="tiptap-button-dropdown-small" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="tiptap-code-languages">
          {LANGUAGES.map(([value, item]) => (
            <DropdownMenuItem key={item} asChild>
              <Button
                type="button"
                variant="ghost"
                data-active-state={value === language ? "on" : "off"}
                showTooltip={false}
                onClick={() => setLanguage(value || null)}
              >
                <span className="tiptap-button-text">{item}</span>
                {value === language ? (
                  <CheckIcon className="tiptap-button-icon" />
                ) : null}
              </Button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="ghost"
        showTooltip={false}
        aria-label={copied ? "Copied" : "Copy the code"}
        onClick={() =>
          navigator.clipboard
            .writeText(code)
            .then(() => setCopied(true), () => said("Could not copy the code", false))
        }
      >
        {copied ? (
          <CheckIcon className="tiptap-button-icon" />
        ) : (
          <CopyIcon className="tiptap-button-icon" />
        )}
      </Button>
    </>
  )
}
