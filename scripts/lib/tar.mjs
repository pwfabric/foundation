// Minimal USTAR tar writer (pure Node, no dependency) — good enough for the
// raw source tgz a publishing pipeline consumes: flat relative paths, no
// `package/` prefix (the pipeline adds that when it re-tars), deterministic
// enough for local dev use. Not a general-purpose tar implementation.
import { gzipSync, gunzipSync } from 'node:zlib'

const BLOCK = 512

function pad(str, len) {
  return str.padEnd(len, '\0')
}

function octal(n, len) {
  return n.toString(8).padStart(len - 1, '0') + '\0'
}

function checksum(header) {
  let sum = 0
  for (let i = 0; i < header.length; i++) sum += header[i]
  return sum
}

function buildHeader(name, size, mtimeSeconds) {
  const header = Buffer.alloc(BLOCK)
  header.write(pad(name, 100), 0, 'utf8')
  header.write(octal(0o644, 8), 100, 'ascii')
  header.write(octal(0, 8), 108, 'ascii') // uid
  header.write(octal(0, 8), 116, 'ascii') // gid
  header.write(octal(size, 12), 124, 'ascii')
  header.write(octal(mtimeSeconds, 12), 136, 'ascii')
  header.write('        ', 148, 'ascii') // checksum placeholder (8 spaces)
  header.write('0', 156, 'ascii') // typeflag: regular file
  header.write(pad('', 100), 157, 'ascii') // linkname
  header.write('ustar', 257, 'ascii')
  header.write('\0', 262, 'ascii')
  header.write('00', 263, 'ascii') // version
  header.write(pad('', 32), 265, 'ascii') // uname
  header.write(pad('', 32), 297, 'ascii') // gname
  header.write(octal(0, 8), 329, 'ascii') // devmajor
  header.write(octal(0, 8), 337, 'ascii') // devminor

  const sum = checksum(header)
  // Checksum field is 6 octal digits + NUL + space (8 bytes) — NOT the same
  // "N-1 digits + NUL" shape as the other octal fields, so it can't reuse
  // octal() without corrupting the value (a slice-based attempt at this
  // dropped a real digit instead of padding, producing a bad checksum).
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii')
  return header
}

/**
 * entries: Array<{ path: string, content: Buffer }>
 * Returns a gzip-compressed tar Buffer.
 */
export function createTgz(entries, { mtimeSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const chunks = []
  for (const { path, content } of entries) {
    if (Buffer.byteLength(path, 'utf8') > 100) {
      throw new Error(`Path too long for USTAR (>100 bytes): ${path}`)
    }
    const header = buildHeader(path, content.length, mtimeSeconds)
    chunks.push(header, content)
    const remainder = content.length % BLOCK
    if (remainder !== 0) chunks.push(Buffer.alloc(BLOCK - remainder))
  }
  chunks.push(Buffer.alloc(BLOCK * 2)) // end-of-archive marker
  const tar = Buffer.concat(chunks)
  return gzipSync(tar, { level: 9 })
}

/**
 * The inverse, for tests: gzip'd USTAR → Array<{ path, content }>. Reads what
 * createTgz writes (and plain USTAR with a `prefix` field); nothing more.
 */
export function readTgz(tgz) {
  const tar = gunzipSync(tgz)
  const out = []
  const field = (h, at, len) => h.subarray(at, at + len).toString('utf8').replace(/\0.*$/s, '')
  for (let at = 0; at + BLOCK <= tar.length; ) {
    const h = tar.subarray(at, at + BLOCK)
    if (h.every((b) => b === 0)) break
    const name = field(h, 0, 100)
    const prefix = field(h, 345, 155)
    const size = parseInt(field(h, 124, 12).trim() || '0', 8)
    const type = String.fromCharCode(h[156] || 48)
    at += BLOCK
    if (type === '0') out.push({ path: prefix ? `${prefix}/${name}` : name, content: tar.subarray(at, at + size) })
    at += Math.ceil(size / BLOCK) * BLOCK
  }
  return out
}
