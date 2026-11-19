// UTF-8 安全的 Base64 编码（支持中文与 Emoji）
export function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binString = ''
  for (let i = 0; i < bytes.length; i++) {
    binString += String.fromCharCode(bytes[i])
  }
  return btoa(binString)
}

// UTF-8 安全的 Base64 解码
export function decodeBase64Utf8(base64: string): string {
  const binString = atob(base64.trim())
  const bytes = new Uint8Array(binString.length)
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i)
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

// URL 编码
export function encodeUrlStr(str: string): string {
  return encodeURIComponent(str)
}

// URL 解码（兼容把 + 号还原为空格或直接标准解码）
export function decodeUrlStr(str: string): string {
  return decodeURIComponent(str.trim())
}
