export function normalizeEncodingLabel(enc?: string): string {
  const upper = (enc || 'UTF-8').toUpperCase()
  if (upper === 'UTF-16LE' || upper === 'UTF-16') return 'UTF-16LE'
  if (upper === 'GBK' || upper === 'GB18030' || upper === 'GB2312') return 'GBK'
  if (upper === 'ASCII') return 'ASCII'
  return 'UTF-8'
}

export function getTextDecoderLabel(encoding: string): string {
  if (encoding === 'UTF-16LE') return 'utf-16le'
  if (encoding === 'GBK') return 'gb18030'
  if (encoding === 'ASCII') return 'ascii'
  return 'utf-8'
}

function byteAt(bytes: Uint8Array, index: number): number | undefined {
  return bytes.subarray(index, index + 1).values().next().value
}

export function hasUtf16LeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && byteAt(bytes, 0) === 0xff && byteAt(bytes, 1) === 0xfe
}

export function hasUtf8Bom(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    byteAt(bytes, 0) === 0xef &&
    byteAt(bytes, 1) === 0xbb &&
    byteAt(bytes, 2) === 0xbf
  )
}

export function stripBomBytes(bytes: Uint8Array, encoding: string): Uint8Array {
  if (encoding === 'UTF-16LE' && hasUtf16LeBom(bytes)) {
    return bytes.subarray(2)
  }
  if ((encoding === 'UTF-8' || encoding === 'ASCII') && hasUtf8Bom(bytes)) {
    return bytes.subarray(3)
  }
  return bytes
}

export function isPureAscii(bytes: Uint8Array): boolean {
  for (const b of bytes) {
    if (b > 0x7f) return false
  }
  return true
}

export function detectAndDecodeBytes(
  bytes: Uint8Array,
  forcedEncoding?: string
): { content: string; encoding: string } {
  if (forcedEncoding) {
    const normalized = normalizeEncodingLabel(forcedEncoding)
    const stripped = stripBomBytes(bytes, normalized)
    const content = new TextDecoder(getTextDecoderLabel(normalized)).decode(stripped)
    return { content, encoding: normalized }
  }

  if (hasUtf16LeBom(bytes)) {
    return {
      content: new TextDecoder('utf-16le').decode(bytes.subarray(2)),
      encoding: 'UTF-16LE'
    }
  }

  if (hasUtf8Bom(bytes)) {
    return {
      content: new TextDecoder('utf-8').decode(bytes.subarray(3)),
      encoding: 'UTF-8'
    }
  }

  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const encoding = bytes.length > 0 && isPureAscii(bytes) ? 'ASCII' : 'UTF-8'
    return { content, encoding }
  } catch {
    const content = new TextDecoder('gb18030').decode(bytes)
    return { content, encoding: 'GBK' }
  }
}
