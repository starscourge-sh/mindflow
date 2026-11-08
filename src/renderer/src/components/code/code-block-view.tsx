import { useEffect, useMemo, useRef, useState } from "react"
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

/**
 * The controls sit inside the block, top right, rather than floating over the
 * document - the language belongs to the block, so it reads as part of it.
 */
export function CodeBlockView(props: NodeViewProps) {
  // A ```mermaid block is a diagram: drawn, with its words kept as the code.
  return props.node.attrs.language === "mermaid" ? <DiagramView {...props} /> : <CodeView {...props} />
}

/** The drawn diagram, or why it could not be drawn (keeping the last good drawing). */
type Drawn = { svg: string | null; error: string | null }

/**
 * A Mermaid diagram, drawn by Pele (loaded only when a note has one) in the
 * theme's own colours and type, set by CSS variables on `.mf-diagram`. The
 * words show only while the caret is in them: click the drawing to edit, the
 * drawing follows as you type, and Esc (the extension's key) steps out below.
 * Kept as a ```mermaid code block, so Markdown and Obsidian read it as theirs.
 */
function DiagramView({ node, editor, getPos }: NodeViewProps) {
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
  return (
    <NodeViewWrapper className="tiptap-code-block mf-diagram-block" data-editing={editing || empty || undefined} data-takes-escape="">
      <pre spellCheck={false}>
        <NodeViewContent as={"code" as "div"} />
      </pre>
      <div ref={box} className="mf-diagram" contentEditable={false} onMouseDown={(event) => event.preventDefault()} onClick={edit}>
        {drawn.svg && !empty ? <div className="mf-diagram-drawing" dangerouslySetInnerHTML={{ __html: drawn.svg }} /> : null}
        {empty ? (
          <p className="mf-diagram-note"><b>An empty diagram.</b> Write Mermaid above it, such as “flowchart LR” and “A --&gt; B”.</p>
        ) : drawn.error ? (
          <p className="mf-diagram-note"><b>Not drawn yet.</b> {plainError(drawn.error)}</p>
        ) : null}
      </div>
    </NodeViewWrapper>
  )
}

/** A parser's message in plain words: which line, never "Expecting NODE_STRING". */
function plainError(message: string): string {
  const line = /line (\d+)/i.exec(message)?.[1]
  return line ? `Line ${line} is not finished, or has a mistake in it.` : "Mermaid cannot read it yet."
}

function CodeView({ node, updateAttributes }: NodeViewProps) {
  const language: string = node.attrs.language ?? ""
  const [copied, setCopied] = useState(false)

  // Only worth running while the block is on auto, and only when the code
  // changes - scoring 37 grammars on every keystroke is not free.
  const code = node.textContent
  // And once more when the grammars arrive, a moment after the note opens.
  const grammars = useGrammars()
  const detected = useMemo(
    () => (language || !grammars ? "" : detectLanguage(code)),
    [language, code, grammars]
  )

  const label =
    LANGUAGES.find(([value]) => value === language)?.[1] ?? language
  const detectedLabel =
    LANGUAGES.find(([value]) => value === detected)?.[1] ?? detected

  // A copy that says nothing looks like a copy that failed.
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <NodeViewWrapper className="tiptap-code-block">
      <div className="tiptap-code-controls" contentEditable={false}>
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
                  onClick={() => updateAttributes({ language: value || null })}
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
      </div>

      {/* The colour attributes are carried by hand. A React node view builds
          its own DOM, so the ones the schema renders onto every other block
          never reach this one and colouring a code block did nothing. */}
      <pre
        data-background={node.attrs.backgroundColor ?? undefined}
        data-color={node.attrs.textColor ?? undefined}
        // Code, codes and tables of names are not prose: no spelling squiggles under them.
        spellCheck={false}
      >
        {/* The `as` prop is typed to div; the tag itself is free. */}
        <NodeViewContent as={"code" as "div"} />
      </pre>
    </NodeViewWrapper>
  )
}
