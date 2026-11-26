import { open as fsOpen, readFile, stat } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import {
  detectAndDecodeBytes,
  getTextDecoderLabel,
  hasUtf16LeBom,
  hasUtf8Bom,
  isPureAscii,
  normalizeEncodingLabel,
  stripBomBytes
} from './encodingHelper'

const STREAM_THRESHOLD = 100 * 1024 * 1024
const CHUNK_SIZE = 4 * 1024 * 1024

export async function readFileWithEncoding(
  filePath: string,
  onProgress?: (percent: number) => void,
  forcedEncoding?: string
): Promise<{ content: string; encoding: string }> {
  const fileStat = await stat(filePath)
  const totalSize = fileStat.size

  if (totalSize <= STREAM_THRESHOLD) {
    const bytes = await readFile(filePath)
    return detectAndDecodeBytes(bytes, forcedEncoding)
  }

  const fileHandle = await fsOpen(filePath, { read: true })
  const chunks: string[] = []
  let bytesReadTotal = 0
  let detectedEncoding = forcedEncoding ? normalizeEncodingLabel(forcedEncoding) : 'UTF-8'
  let decoder: TextDecoder | null = forcedEncoding
    ? new TextDecoder(getTextDecoderLabel(detectedEncoding))
    : null
  let isFirstChunk = true

  try {
    const buffer = new Uint8Array(CHUNK_SIZE)
    while (true) {
      const n = await fileHandle.read(buffer)
      if (n === null || n === 0) break

      let chunkBytes: Uint8Array<ArrayBufferLike> = buffer.subarray(0, n)

      if (isFirstChunk) {
        isFirstChunk = false
        if (forcedEncoding) {
          chunkBytes = stripBomBytes(chunkBytes, detectedEncoding)
        } else {
          if (hasUtf16LeBom(chunkBytes)) {
            detectedEncoding = 'UTF-16LE'
            chunkBytes = chunkBytes.subarray(2)
          } else if (hasUtf8Bom(chunkBytes)) {
            detectedEncoding = 'UTF-8'
            chunkBytes = chunkBytes.subarray(3)
          } else {
            try {
              new TextDecoder('utf-8', { fatal: true }).decode(chunkBytes)
              detectedEncoding = isPureAscii(chunkBytes) ? 'ASCII' : 'UTF-8'
            } catch {
              detectedEncoding = 'GBK'
            }
          }
          decoder = new TextDecoder(getTextDecoderLabel(detectedEncoding))
        }
      }

      bytesReadTotal += n
      chunks.push(decoder!.decode(chunkBytes, { stream: true }))

      if (onProgress && totalSize > 0) {
        onProgress(Math.min(99, Math.round((bytesReadTotal / totalSize) * 100)))
      }
      await new Promise(resolve => setTimeout(resolve, 0))
    }

    if (decoder) {
      chunks.push(decoder.decode())
    }
    if (onProgress) onProgress(100)
    return { content: chunks.join(''), encoding: detectedEncoding }
  } finally {
    await fileHandle.close()
  }
}

export async function readFileSmart(
  filePath: string,
  onProgress?: (percent: number) => void,
  forcedEncoding?: string
): Promise<string> {
  const res = await readFileWithEncoding(filePath, onProgress, forcedEncoding)
  return res.content
}

export async function writeFileWithEncoding(
  filePath: string,
  content: string,
  encoding: string
): Promise<void> {
  await invoke('write_file_with_encoding', {
    path: filePath,
    content,
    encoding: normalizeEncodingLabel(encoding)
  })
}
