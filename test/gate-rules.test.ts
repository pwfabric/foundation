/**
 * The four source rules (scripts/lib/source-rules.mjs), each proven both
 * ways: the defective shape must be reported, the fixed shape must pass. The
 * same rules run inside scripts/check-integrity.mjs on every pack.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — a zero-dependency .mjs with no type declarations
import { itemScopeFindings, formFieldFindings, styleParenFindings, inlineOutlineFindings, scanSource } from '../scripts/lib/source-rules.mjs'

describe('itemScope — {{item.}} needs an ancestor with repeat', () => {
  // A result-rows band: items + template, no repeat.
  const ghostRow = {
    id: 'r',
    type: 'repeater',
    props: { items: '{{RESULTS}}' },
    children: [{ id: 'r-t', type: 'text', props: { content: '{{item.title}}' } }],
  }

  it('reports the template that renders outside any item', () => {
    expect(itemScopeFindings(ghostRow)).toEqual([{ path: 'snippet.children[0]' }])
  })

  it('passes once the repeater carries repeat', () => {
    expect(itemScopeFindings({ ...ghostRow, repeat: '{{RESULTS}}' })).toEqual([])
  })

  it('the repeat node itself resolves in the OUTER scope', () => {
    expect(itemScopeFindings({ id: 'x', type: 'container', repeat: '{{S}}', props: { title: '{{item.x}}' }, children: [] })).toHaveLength(1)
  })

  it('reads style and visibleWhen too, and walks arrays of blocks', () => {
    const tree = [{ id: 'a', type: 'text', visibleWhen: '{{item.show}}', props: {} }]
    expect(itemScopeFindings(tree, 'blocks')).toEqual([{ path: 'blocks[0]' }])
  })
})

describe('formFieldNames — a form field in a form has its own name', () => {
  const isField = (t: string) => ['input', 'select', 'textarea', 'checkbox'].includes(t)
  const form = (children: unknown[]) => ({ id: 'f', type: 'form', props: {}, children })

  it('reports an unnamed field inside a form', () => {
    const out = formFieldFindings(form([{ id: 'a', type: 'input', props: { type: 'email' } }]), isField)
    expect(out).toEqual([{ path: 'snippet.children[0]', kind: 'unnamed' }])
  })

  it('reports two text fields sharing a name', () => {
    const out = formFieldFindings(
      form([
        { id: 'a', type: 'input', props: { name: 'email' } },
        { id: 'b', type: 'input', props: { name: 'email' } },
      ]),
      isField
    )
    expect(out).toEqual([{ path: 'snippet.children[1]', kind: 'duplicate', name: 'email' }])
  })

  it('passes named fields, a checkbox group, a slot name, and fields outside a form', () => {
    const out = formFieldFindings(
      [
        form([
          { id: 'a', type: 'input', props: { name: '{{FIELD}}' } },
          { id: 'b', type: 'checkbox', props: { name: 'tags' } },
          { id: 'c', type: 'checkbox', props: { name: 'tags' } },
        ]),
        { id: 'filter', type: 'input', props: { stateKey: 'q' } },
      ],
      isField
    )
    expect(out).toEqual([])
  })
})

describe('styleParens — a CSS function string balances', () => {
  it('reports the 4.0.3 tint() of alert, badge and chip', () => {
    const src403 = [
      'const tint = (token: string, pct: number): string =>',
      '  `color-mix(in srgb, ${token} ${pct}%, var(--pw-color-card)`',
      "const bg = 'color-mix(in srgb, var(--pw-color-primary)'",
    ].join('\n')
    const out = styleParenFindings(src403)
    expect(out.map((f: { line: number }) => f.line)).toEqual([2, 3])
  })

  it('passes the balanced helper, concatenated pieces, comments and regexes', () => {
    const src404 = [
      '// an unclosed color-mix( in prose is not code',
      'export const tint = (t: string) => `color-mix(in srgb, ${t} 14%, var(--pw-color-card))`',
      "const v = 'var(' + prop + ')'",
      "const re = /var\\(/g",
      "const s = \"don't\" + 'calc(1px + 2px)'",
    ].join('\n')
    expect(styleParenFindings(src404)).toEqual([])
  })
})

describe("inlineOutlineNone — no inline outline: 'none'", () => {
  it('reports the 4.0.3 input style', () => {
    const out = inlineOutlineFindings("const s = {\n  color: 'red',\n  outline: 'none',\n}")
    expect(out).toEqual([{ line: 3, text: "outline: 'none'" }])
    expect(inlineOutlineFindings('const s = { outline: 0 }')).toHaveLength(1)
  })

  it('passes outlineColor, outline offsets and comments', () => {
    const src = "/* outline: 'none' erased the ring */\nconst s = { outlineColor: 'red', outlineOffset: 2, outline: '2px solid red' }"
    expect(inlineOutlineFindings(src)).toEqual([])
  })

  it('keeps line numbers across block comments', () => {
    const { code } = scanSource("/* a\nb\n*/\nx")
    expect(code.split('\n')).toHaveLength(4)
  })
})
