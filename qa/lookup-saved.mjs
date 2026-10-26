// A word saved as a gem has its meaning (it cannot be saved without one), so
// it is answered: it leaves Lookups' "asked" instead of waiting there forever.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/lookup-saved.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1000, height: 700 })
const api = (path, ...args) => c.h.evaluate(([p, a]) => p.split('.').reduce((o, k) => o[k], window.api)(...a), [path, args])
try {
  const asked = await api('captures.create', { kind: 'word', body: 'Sigil' })
  const saved = await api('captures.create', { kind: 'word', body: 'Glib: fluent but insincere and shallow.' })
  const got = await c.v('promote', saved)
  const rows = await api('captures.list')
  const of = (id) => rows.find((one) => one.id === id)?.lookup
  check('a word with no meaning is asked', of(asked) === 'asked', of(asked))
  check('a word saved as a gem, with its meaning, is answered', typeof got === 'string' && got.length > 20 && of(saved) === 'answered', `${got} ${of(saved)}`)
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
