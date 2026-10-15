import { useEffect, useState } from "react"
import { NodeViewWrapper, useEditorState, type NodeViewProps } from "@tiptap/react"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Transaction } from "@tiptap/pm/state"

import { headingsInDoc } from "@/components/toc/headings"
import { jumpTo } from "@/extensions/contents-block"
import { cue } from "@/lib/cues"
import { onlyWordsChanged } from "@/lib/tiptap-utils"
import { Chevron } from "@/components/ui/icons"

type Row = { level: number; text: string }

/** H1 to H3, as Notion's does: deeper ones are detail, not structure. */
const listed = (doc: ProseMirrorNode) => headingsInDoc(doc).filter((one) => one.level <= 3)
const rowsOf = (doc: ProseMirrorNode): Row[] => listed(doc).map(({ level, text }) => ({ level, text }))

const same = (a: Row[], b: Row[]): boolean =>
  a.length === b.length && a.every((one, i) => one.level === b[i].level && one.text === b[i].text)

/** Only a change that could touch a heading: words typed in a paragraph cannot. */
const touchesHeadings = (tr: Transaction): boolean =>
  !onlyWordsChanged(tr) ||
  tr.steps.some((step, i) => /^(heading|detailsSummary)$/.test(tr.docs[i].resolve((step as unknown as { from: number }).from).parent.type.name))

/** How deep each row sits under the ones before it, and its number: 1, 1.1, 1.2, 2. */
function nest(rows: Row[]): (Row & { depth: number; number: string })[] {
  const open: number[] = []
  const counts: number[] = []
  return rows.map((row) => {
    while (open.length && open[open.length - 1] >= row.level) open.pop()
    open.push(row.level)
    const depth = open.length - 1
    counts.length = depth + 1
    counts[depth] = (counts[depth] ?? 0) + 1
    return { ...row, depth, number: counts.join(".") }
  })
}

/** Up and down move between the rows and the title; Escape hands the block back to the editor. */
function step(event: React.KeyboardEvent<HTMLElement>, back: () => void): void {
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(".mf-contents-head, .mf-contents-entry")]
  const at = rows.indexOf(document.activeElement as HTMLElement)
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault()
    rows[Math.min(rows.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus()
  } else if (event.key === "Escape") {
    event.preventDefault()
    event.stopPropagation()
    back()
  }
}

/** The table of contents block: the note's headings, live, each one a way there. */
export function ContentsView({ editor, node, getPos, updateAttributes }: NodeViewProps): React.JSX.Element {
  const { collapsed, numbered } = node.attrs as { collapsed: boolean; numbered: boolean }
  const [rows, setRows] = useState(() => rowsOf(editor.state.doc))

  // Read again only when a heading could have changed; in a long note, once the typing pauses.
  useEffect(() => {
    let later: ReturnType<typeof setTimeout> | undefined
    const update = (): void => setRows((now) => {
      const next = rowsOf(editor.state.doc)
      return same(now, next) ? now : next
    })
    const changed = ({ transaction }: { transaction: Transaction }): void => {
      if (!transaction.docChanged || !touchesHeadings(transaction)) return
      clearTimeout(later)
      if (editor.state.doc.content.size > 20000) later = setTimeout(update, 300)
      else update()
    }
    editor.on("transaction", changed)
    return () => {
      clearTimeout(later)
      editor.off("transaction", changed)
    }
  }, [editor])

  const selected = useEditorState({
    editor,
    selector: ({ editor }) => {
      const pos = getPos()
      if (typeof pos !== "number") return false
      const { from, to } = editor.state.selection
      return from <= pos && to >= pos + node.nodeSize
    },
  })

  const back = (): void => {
    const pos = getPos()
    if (typeof pos === "number") editor.chain().setNodeSelection(pos).focus(undefined, { scrollIntoView: false }).run()
  }

  const go = (index: number): void => {
    const heading = listed(editor.state.doc)[index]
    if (heading) jumpTo(editor, heading.pos)
  }

  return (
    <NodeViewWrapper
      className={`mf-contents${selected ? " is-selected" : ""}`}
      data-collapsed={collapsed || undefined}
      data-numbered={numbered || undefined}
      contentEditable={false}
      onKeyDown={(event: React.KeyboardEvent<HTMLElement>) => step(event, back)}
    >
      <div className="mf-contents-bar">
        <button
          type="button"
          className="mf-contents-head"
          aria-expanded={!collapsed}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            cue(collapsed ? "unfold" : "fold")
            updateAttributes({ collapsed: !collapsed })
          }}
        >
          Contents
          <Chevron />
        </button>
        {!collapsed && rows.length > 0 && (
          <button
            type="button"
            className="mf-contents-numbers"
            aria-pressed={numbered}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => updateAttributes({ numbered: !numbered })}
          >
            {numbered ? "Numbered" : "Number"}
          </button>
        )}
      </div>
      {!collapsed &&
        (rows.length ? (
          <ol className="mf-contents-list">
            {nest(rows).map((row, index) => (
              <li key={index} className="mf-contents-row" style={{ "--depth": row.depth } as React.CSSProperties}>
                <button
                  type="button"
                  className="mf-contents-entry"
                  data-level={row.level}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => go(index)}
                >
                  {numbered && <span className="mf-contents-number">{row.number}</span>}
                  <span className="mf-contents-text">{row.text}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mf-contents-empty">Add headings and they'll show here.</p>
        ))}
    </NodeViewWrapper>
  )
}
