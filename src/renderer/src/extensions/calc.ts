import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { MathJsInstance } from "mathjs"

import { cue } from "@/lib/cues"

/**
 * Math as you type, the way Soulver and Apple's Math Notes do it.
 *
 * A line ending in `=` gets its answer drawn after it, faint, and Tab writes it
 * in. A line like `lunch = 25` names a number for the lines below it, so
 * `lunch * 2 =` answers 50. Names belong to the note: each one is worked out
 * from the top every time, so there is nothing to keep in step.
 *
 * Units are mathjs's own (`5 km in mi`), and money is a unit too, at rates
 * fetched once a day from a free, keyless service (`$40 * 3 in EUR`).
 *
 * mathjs is large and most notes never ask it anything, so it is loaded the
 * first time a line has an `=` in it.
 */

const key = new PluginKey<DecorationSet>("calc")

/** A worked answer, kept on the decoration so Tab knows what to write. */
type Answer = { answer: string }

let math: MathJsInstance | null = null
let loading = false
let on = true
const views = new Set<EditorView>()

/** Draw again everywhere: mathjs arrived, the rates did, or the switch moved. */
function refresh(): void {
  for (const view of views) view.dispatch(view.state.tr.setMeta(key, true))
}

/** Whether answers are shown, for every editor on the page at once. */
export function setCalc(enabled: boolean): void {
  if (on === enabled) return
  on = enabled
  refresh()
}

// --- money ---------------------------------------------------------------

const RATES = "https://open.er-api.com/v6/latest/USD"
const CACHE = "mf-currency-rates"
const DAY = 86_400_000

/** How many of each currency a dollar buys. A day old at most; stale beats none. */
async function rates(): Promise<Record<string, number>> {
  let cached: { at: number; rates: Record<string, number> } | null = null
  try {
    cached = JSON.parse(localStorage.getItem(CACHE) ?? "null")
  } catch {
    cached = null
  }
  if (cached && Date.now() - cached.at < DAY) return cached.rates
  try {
    const fresh = (await (await fetch(RATES)).json()) as { rates?: Record<string, number> }
    if (!fresh.rates) throw new Error("no rates")
    try {
      localStorage.setItem(CACHE, JSON.stringify({ at: Date.now(), rates: fresh.rates }))
    } catch {
      // Not kept for tomorrow, but good for today.
    }
    return fresh.rates
  } catch {
    return cached?.rates ?? {}
  }
}

/** The signs people type in front of an amount. */
const SIGNS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR" }
const CURRENCIES = new Set(["USD"])

function load(): void {
  if (loading) return
  loading = true
  void import("mathjs").then(({ create, all }) => {
    const instance = create(all)
    instance.createUnit("USD")
    math = instance
    refresh()
    void rates().then((table) => {
      for (const [code, rate] of Object.entries(table)) {
        if (code === "USD" || !/^[A-Z]{3}$/.test(code) || !rate) continue
        // A code that is already a unit's name is left as that unit.
        try {
          instance.createUnit(code, { definition: `${1 / rate} USD` })
          CURRENCIES.add(code)
        } catch {
          /* taken */
        }
      }
      refresh()
    })
  })
}

// --- working it out ------------------------------------------------------

/** What people type, in the shape mathjs reads. */
function prepare(text: string): string {
  return (
    text
      // $40 is 40 USD; a thousands comma inside an amount is not an argument list.
      .replace(/([$€£¥₹])\s?(\d[\d,]*(?:\.\d+)?)/g, (_, sign: string, amount: string) => `${amount.replace(/,/g, "")} ${SIGNS[sign]}`)
      // 10% of 200.
      .replace(/(\d+(?:\.\d+)?)\s*%\s+of\s+/gi, "$1 / 100 * ")
      // A conversion covers everything before it: `$40 * 3 in EUR` is the
      // whole sum in euros, where mathjs alone reads it as 40 × (3 in EUR).
      .replace(/^(.*\S)\s+(?:in|to|as)\s+([$€£¥₹]|[A-Za-z]\w*)\s*$/, (_, sum: string, unit: string) => `(${sum}) to ${SIGNS[unit] ?? unit}`)
  )
}

// Always a dot and no thousands commas, whatever the Mac's region: an answer
// written in has to read back as the same number on the next line.
const number = (n: number): string =>
  n.toLocaleString("en-US", { maximumFractionDigits: Math.abs(n) < 1 ? 6 : 4, useGrouping: false })

/** An answer worth showing, or null for anything that is not a quantity. */
function show(result: unknown): string | null {
  if (!math) return null
  if (typeof result === "number") return Number.isFinite(result) ? number(result) : null
  if (math.isBigNumber(result) || math.isFraction(result)) return number(Number(result))
  if (math.isUnit(result)) {
    const unit = result.formatUnits()
    const value = result.toNumber(unit)
    if (!Number.isFinite(value)) return null
    if (CURRENCIES.has(unit)) {
      return value.toLocaleString("en-US", { style: "currency", currency: unit, useGrouping: false })
    }
    return `${number(value)} ${unit}`
  }
  return null
}

/** One word on its own that names nothing in the note: `g =` is not asking what a gram is. */
const bare = (text: string, scope: Map<string, unknown>): boolean => /^[A-Za-z_]\w*$/.test(text.trim()) && !scope.has(text.trim())

function evaluate(text: string, scope: Map<string, unknown>): string | null {
  if (!math || !text.trim() || bare(text, scope)) return null
  try {
    return show(math.evaluate(prepare(text), scope))
  } catch {
    // A label in front of the sum, `Dinner: 25 * 2 =`, is words, not math.
    const colon = text.lastIndexOf(":")
    if (colon < 0 || bare(text.slice(colon + 1), scope)) return null
    try {
      return show(math.evaluate(prepare(text.slice(colon + 1)), scope))
    } catch {
      return null
    }
  }
}

/** A name being given a value, at the start of a line: `lunch = 25`. */
const NAMING = /^\s*[A-Za-z_]\w*\s*=[^=]/

function answers(doc: ProseMirrorNode): DecorationSet {
  if (!on) return DecorationSet.empty
  const found: Decoration[] = []
  const scope = new Map<string, unknown>()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    // Code is code: an `=` there is an assignment in some other language.
    if (node.type.spec.code) return false
    const text = node.textContent
    if (!text.includes("=")) return false
    if (!math) {
      load()
      return false
    }
    const trimmed = text.trimEnd()
    if (trimmed.endsWith("=") && !trimmed.endsWith("==")) {
      const said = evaluate(trimmed.slice(0, -1), scope)
      if (said) {
        const shown = `${text.endsWith(" ") ? "" : " "}${said}`
        const ghost = (): HTMLElement => {
          const span = document.createElement("span")
          span.className = "mf-calc-ghost"
          span.contentEditable = "false"
          span.title = "Tab writes it in"
          span.textContent = shown
          return span
        }
        // The space is part of the key, or typing one keeps the old widget and
        // the answer shows two spaces off.
        found.push(Decoration.widget(pos + node.nodeSize - 1, ghost, { side: 1, key: `calc:${shown}`, answer: said } satisfies Answer & { side: number; key: string }))
      }
    } else if (NAMING.test(text)) {
      evaluate(text, scope)
    }
    return false
  })
  return DecorationSet.create(doc, found)
}

/** Tab, with the caret at the end of a line that has an answer: write it in. */
function accept(view: EditorView, state: EditorState): boolean {
  const { selection } = state
  if (!selection.empty || !view.editable) return false
  const { $head } = selection
  if ($head.parentOffset !== $head.parent.content.size) return false
  const [ghost] = key.getState(state)?.find($head.pos, $head.pos) ?? []
  const answer = (ghost?.spec as Answer | undefined)?.answer
  if (!answer) return false
  const gap = $head.parent.textContent.endsWith(" ") ? "" : " "
  view.dispatch(state.tr.insertText(`${gap}${answer}`))
  cue("math")
  return true
}

export const Calc = Extension.create({
  name: "calc",
  // Ahead of every other Tab: indenting a list, a code block's own tab.
  priority: 1000,

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => answers(state.doc),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(key) ? answers(tr.doc) : old),
        },
        view: (view) => {
          views.add(view)
          return { destroy: () => views.delete(view) }
        },
        props: {
          decorations: (state) => key.getState(state),
          handleKeyDown: (view, event) => {
            if (event.key !== "Tab" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false
            if (!accept(view, view.state)) return false
            event.preventDefault()
            return true
          },
        },
      }),
    ]
  },
})
