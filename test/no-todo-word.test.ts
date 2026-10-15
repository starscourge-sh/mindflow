// Run with: node --test test/no-todo-word.test.ts
// One word for something to do: a Task. You catch a task, and it lands in
// Tasks; a list of boxes inside a note is a Checklist. "Todo" and "to-do"
// once named the same thing as "Task" and tripped people up, so no words the
// app shows may use them. They stay as search words ("todo" still finds Task
// and Checklist) and as the kind's id in the data, which nobody sees.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(import.meta.dirname, '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

/** The quoted strings in a line of code, comments left out. */
const strings = (line: string): string[] => {
  const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/\{\/\*.*?\*\/\}/g, '')
  return [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`|>([^<>{}\n]+)</g)].map((m) => m[1] ?? m[2] ?? m[3] ?? m[4] ?? '')
}

test('no words the app shows say "Todo" or "to-do"', () => {
  const found: string[] = []
  for (const path of [...files(join(root, 'src/renderer/src')), ...files(join(root, 'src/main'))]) {
    readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
      // Search words for the old name are the point: keywords lists, and the reader for imported text.
      if (/keywords|test\(text\)|\/\^\(todo/.test(line)) return
      for (const raw of strings(line)) {
        // What a template fills in is code, not words; a database query is not shown either.
        const text = raw.replace(/\$\{[^}]*\}/g, '')
        if (/^\s*select\b/i.test(text)) continue
        // Prose only: a string with a space in it, or a label starting with a capital. Ids ('todo') and icon names pass.
        if (!/\s/.test(text.trim()) && !/^[A-Z]/.test(text)) continue
        if (/\b(todos?|to-dos?)\b/i.test(text) && !/Todoist|ListTodo/.test(text)) found.push(`${relative(root, path)}:${i + 1}  ${text.trim().slice(0, 80)}`)
      }
    })
  }
  assert.deepEqual(found, [], `Say "task" (or "checklist" for boxes in a note):\n${found.join('\n')}`)
})
