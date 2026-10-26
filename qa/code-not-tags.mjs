// A "#" inside code is no tag: a shell comment in a code block ("rm -rf x #then…")
// or `#put` in inline code stays out of the tags list and a page's tags, while a
// real #tag beside it still counts.
//   QA_DATA=$(mktemp -d) QA_ENTRY=$PWD/out-x/main/index.js HALIGTREE_QA_AWAY=1 node qa/code-not-tags.mjs
process.env.QA_ARGS ??= '--sandbox'
const { sandbox } = await import('./sandbox-lib.mjs')
const { checks } = await import('./harness.mjs')
const { check, done } = checks()
const c = await sandbox({ width: 1000, height: 700 })
try {
  const page = await c.v('article:new')
  const text = (words, marks) => ({ type: 'text', text: words, ...(marks ? { marks } : {}) })
  await c.v('item:save', page, { title: 'Shell notes', body: { type: 'doc', content: [
    { type: 'paragraph', content: [text('Real one #shellreal and '), text('#inlinecodetag', [{ type: 'code' }])] },
    { type: 'codeBlock', attrs: { language: 'bash' }, content: [text('rm -rf ~/.local #codeblocktag\nmv a b #anothercode')] }
  ] } })
  const md = await c.v('article:new')
  await c.v('item:save', md, { title: 'Markdown shell', body: 'Words #mdreal\n\n```bash\nls #mdfenced\n```\n\nand `#mdinline` too' })
  await c.h.waitForTimeout(500)
  const tags = (await c.v('tags')).map((one) => one.tag)
  check('real tags count', tags.includes('shellreal') && tags.includes('mdreal'), tags.filter((t) => /real/.test(t)).join())
  check('a "#" in code makes no tag', !['inlinecodetag', 'codeblocktag', 'anothercode', 'mdfenced', 'mdinline'].some((t) => tags.includes(t)), tags.filter((t) => /code|md/.test(t)).join())
} catch (error) {
  check('the run finished', false, error.message.split('\n')[0])
} finally {
  await c.close()
}
done()
