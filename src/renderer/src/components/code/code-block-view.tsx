import { useEffect, useMemo, useState } from "react"
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react"

// --- Icons ---
import { Copy as CopyIcon } from "lucide-react"

// --- Lib ---
import { detectLanguage } from "@/lib/lowlight"
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
export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language: string = node.attrs.language ?? ""
  const [copied, setCopied] = useState(false)

  // Only worth running while the block is on auto, and only when the code
  // changes - scoring 37 grammars on every keystroke is not free.
  const code = node.textContent
  const detected = useMemo(
    () => (language ? "" : detectLanguage(code)),
    [language, code]
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
              .then(() => setCopied(true))
          }
        >
          {copied ? (
            <CheckIcon className="tiptap-button-icon" />
          ) : (
            <CopyIcon className="tiptap-button-icon" />
          )}
        </Button>
      </div>

      <pre>
        {/* The `as` prop is typed to div; the tag itself is free. */}
        <NodeViewContent as={"code" as "div"} />
      </pre>
    </NodeViewWrapper>
  )
}
