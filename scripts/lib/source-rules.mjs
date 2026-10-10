// Four source rules. Each one is a defect class that ships easily in more than
// one atom and is silent at render — which is why it is a gate and not a
// review note:
//
//   itemScope          `{{item.…}}` with no ancestor carrying `repeat`
//   formFieldNames     a form field inside a form with no name, or a name
//                      two fields fight over
//   styleParens        a CSS function string whose parentheses do not
//                      balance — an unclosed `color-mix(`
//   inlineOutlineNone  `outline: 'none'` in a component — it erases the
//                      runtime's focus ring
//
// Pure functions over parsed JSON and source text, zero dependencies, so the
// integrity script imports them and test/gate-rules.test.ts proves each against
// a fixture that must fail and one that must pass.

/** True when a pattern/surface node reads the per-item scope. */
const READS_ITEM = /\{\{[^}]*\bitem\s*[.[]/

/**
 * `{{item.x}}` resolves only inside a subtree the runtime expanded per item —
 * the children of a node carrying a block-level `repeat`. The node that carries
 * `repeat` itself still resolves in the OUTER scope, so only descendants count.
 * Returns `[{ path }]` for every node reading item outside such a subtree.
 */
export function itemScopeFindings(node, path = 'snippet', inRepeat = false, out = []) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => itemScopeFindings(n, `${path}[${i}]`, inRepeat, out))
    return out
  }
  if (!node || typeof node !== 'object') return out
  const own = JSON.stringify([node.props ?? null, node.style ?? null, node.visibleWhen ?? null, node.if ?? null])
  if (!inRepeat && READS_ITEM.test(own)) out.push({ path })
  const repeats = typeof node.repeat === 'string' && node.repeat.trim() !== ''
  ;(node.children ?? []).forEach((c, i) => itemScopeFindings(c, `${path}.children[${i}]`, inRepeat || repeats, out))
  return out
}

/**
 * Form fields inside a `form`: each needs a name (a nameless field's value
 * never reaches the submitted record) and a name belongs to one field — two
 * text fields sharing one name used to overwrite each other. A group of
 * checkboxes sharing a name is a real multi-value field and is allowed.
 *
 * `isField(type)` says whether a block type is a form field (the catalogue's
 * `form-field` trait). Returns `[{ path, kind: 'unnamed' | 'duplicate', name? }]`.
 */
export function formFieldFindings(node, isField, path = 'snippet', form = null, out = []) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => formFieldFindings(n, isField, `${path}[${i}]`, form, out))
    return out
  }
  if (!node || typeof node !== 'object') return out
  if (form && node.type && isField(node.type)) {
    const name = node.props?.name
    if (typeof name !== 'string' || name.trim() === '') out.push({ path, kind: 'unnamed' })
    else {
      const seen = form.names.get(name) ?? []
      seen.push({ path, type: node.type })
      form.names.set(name, seen)
    }
  }
  const here = node.type === 'form' ? { path, names: new Map() } : form
  ;(node.children ?? []).forEach((c, i) => formFieldFindings(c, isField, `${path}.children[${i}]`, here, out))
  if (node.type === 'form') {
    for (const [name, fields] of here.names) {
      if (fields.length > 1 && !fields.every((f) => f.type === 'checkbox')) {
        out.push({ path: fields[1].path, kind: 'duplicate', name })
      }
    }
  }
  return out
}

/**
 * Split TS/TSX source into its string literals (template literals with every
 * `${…}` replaced by `X`) and the code with comments removed. A small scanner
 * rather than a regex: comments hold apostrophes ("don't"), strings hold `//`
 * ("https://…"), and a regex over raw text mistakes one for the other.
 */
export function scanSource(src) {
  const literals = []
  let code = ''
  let i = 0
  const n = src.length
  let prevSignificant = ''

  const readQuoted = (q) => {
    const start = i
    i++
    let text = ''
    while (i < n && src[i] !== q && src[i] !== '\n') {
      if (src[i] === '\\') {
        text += src[i] + (src[i + 1] ?? '')
        i += 2
        continue
      }
      text += src[i]
      i++
    }
    i++
    literals.push({ index: start, end: i, text, quote: q })
    code += src.slice(start, i)
  }

  const readTemplate = () => {
    // Called with i on the opening backtick OR just after a closing `}` of `${`.
    const start = i
    if (src[i] === '`') i++
    let text = ''
    while (i < n) {
      const c = src[i]
      if (c === '\\') {
        text += c + (src[i + 1] ?? '')
        i += 2
        continue
      }
      if (c === '`') {
        i++
        literals.push({ index: start, end: i, text, quote: '`' })
        code += src.slice(start, i)
        return
      }
      if (c === '$' && src[i + 1] === '{') {
        text += 'X'
        i += 2
        // Scan the expression as code until its matching brace.
        let depth = 1
        while (i < n && depth > 0) {
          const d = src[i]
          if (d === "'" || d === '"') {
            const q = d
            i++
            while (i < n && src[i] !== q) i += src[i] === '\\' ? 2 : 1
            i++
            continue
          }
          if (d === '`') {
            // nested template: skip it wholesale
            i++
            let nd = 0
            while (i < n && !(src[i] === '`' && nd === 0)) {
              if (src[i] === '\\') { i += 2; continue }
              if (src[i] === '$' && src[i + 1] === '{') { nd++; i += 2; continue }
              if (src[i] === '}' && nd > 0) nd--
              i++
            }
            i++
            continue
          }
          if (d === '{') depth++
          else if (d === '}') depth--
          i++
        }
        continue
      }
      text += c
      i++
    }
    literals.push({ index: start, end: i, text, quote: '`' })
    code += src.slice(start, i)
  }

  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? n : end + 2
      // Keep the line structure, so a line in `code` is the same line in `src`.
      code += src.slice(i, stop).replace(/[^\n]/g, '')
      i = stop
      continue
    }
    if (c === "'" || c === '"') {
      readQuoted(c)
      prevSignificant = 'str'
      continue
    }
    if (c === '`') {
      readTemplate()
      prevSignificant = 'str'
      continue
    }
    // A regex literal: `/` where an expression may start.
    if (c === '/' && (prevSignificant === '' || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prevSignificant))) {
      const start = i
      i++
      let inClass = false
      while (i < n && src[i] !== '\n') {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === '[') inClass = true
        else if (src[i] === ']') inClass = false
        else if (src[i] === '/' && !inClass) break
        i++
      }
      i++
      while (i < n && /[a-z]/i.test(src[i])) i++
      code += src.slice(start, i)
      prevSignificant = 'regex'
      continue
    }
    if (!/\s/.test(c)) prevSignificant = c
    code += c
    i++
  }
  return { literals, code }
}

const CSS_FUNCTION = /\b(color-mix|calc|var|rgba?|hsla?|min|max|clamp|linear-gradient|radial-gradient|conic-gradient|translate[XY]?|minmax|repeat|env)\(/

/**
 * String literals that carry a CSS function and whose parentheses do not
 * balance. A literal that is one piece of a `+` concatenation
 * (`'var(' + prop + ')'`) is judged by its whole expression, so it is skipped.
 * Returns `[{ line, text }]`.
 */
export function styleParenFindings(src) {
  const { literals } = scanSource(src)
  const out = []
  for (const lit of literals) {
    if (!CSS_FUNCTION.test(lit.text)) continue
    const before = src.slice(Math.max(0, lit.index - 4), lit.index).trimEnd()
    const after = src.slice(lit.end, lit.end + 4).trimStart()
    if (before.endsWith('+') || after.startsWith('+')) continue
    let depth = 0
    let ok = true
    for (const ch of lit.text) {
      if (ch === '(') depth++
      else if (ch === ')') {
        depth--
        if (depth < 0) { ok = false; break }
      }
    }
    if (depth !== 0) ok = false
    if (!ok) out.push({ line: src.slice(0, lit.index).split('\n').length, text: lit.text })
  }
  return out
}

/**
 * An inline `outline: 'none'` (or `0`) in component code — comments excluded.
 * The runtime draws the focus ring at zero specificity (`:where()`), so an
 * inline outline always wins and the keyboard focus disappears. Returns `[{ line }]`.
 */
export function inlineOutlineFindings(src) {
  const { code } = scanSource(src)
  const out = []
  const re = /\boutline(?:Style)?\s*:\s*(?:'none'|"none"|`none`|'0'|"0"|0(?![.\d]))/g
  let m
  while ((m = re.exec(code))) {
    out.push({ line: code.slice(0, m.index).split('\n').length, text: m[0] })
  }
  return out
}
