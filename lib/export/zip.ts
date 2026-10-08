/**
 * Minimal ZIP writer built on the platform `CompressionStream`.
 *
 * A sitemap split can produce dozens of files, and browsers refuse to save several
 * programmatic downloads without a prompt. Building the archive in the browser
 * keeps the app dependency-free (no JSZip/fflate) while still delivering one file.
 *
 * Why it works: ZIP stores each entry as `[local header][data][central directory]`
 * and this implementation uses the DEFLATE method (8) fed by
 * `CompressionStream('deflate-raw')`. Timestamps are fixed so the output is
 * deterministic and easy to assert on in tests.
 *
 * 極簡 ZIP 封裝器，建構於平台內建的 `CompressionStream` 之上。
 * sitemap 拆分後可能產生數十個檔案，而瀏覽器對連續下載會要求使用者授權甚至直接拒絕；
 * 在瀏覽器端封裝可在不引入 JSZip/fflate 等相依套件的前提下仍然只交付一個檔案。
 *
 * 原理：ZIP 以「[local header][資料][中央目錄]」結構儲存每個項目，
 * 這裡採用 DEFLATE 方法（8），資料由 `CompressionStream('deflate-raw')` 產生。
 * 時間戳固定，因此輸出可重現、方便測試斷言。
 */
import type { DownloadPayload } from './types'

/** Fixed DOS timestamp (1980-01-01 00:00:00) for reproducible archives. */
const DOS_TIME = 0
const DOS_DATE = 33

/**
 * CRC-32 (IEEE polynomial) lookup + checksum.
 * ZIP requires it in both the local header and the central directory.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[i] = value >>> 0
  }
  return table
})()

/**
 * Compute the CRC-32 of a byte array.
 *
 * @param bytes Data to checksum.
 */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** Deflate a byte array, falling back to "stored" when compression is unavailable. */
async function deflateRaw(bytes: Uint8Array): Promise<{ data: Uint8Array; method: number }> {
  if (typeof CompressionStream !== 'function') return { data: bytes, method: 0 }

  // Some engines (older Safari, jsdom) lack Blob.stream(); store instead of crashing.
  const source = new Blob([bytes as BlobPart])
  if (typeof source.stream !== 'function') return { data: bytes, method: 0 }

  const stream = source.stream().pipeThrough(new CompressionStream('deflate-raw'))
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer())

  // Never let "compression" grow the entry (tiny/incompressible files).
  if (compressed.length >= bytes.length) return { data: bytes, method: 0 }
  return { data: compressed, method: 8 }
}

/** UTF-8 encode without relying on Node-only APIs (works in browsers and jsdom). */
function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** Concatenate byte chunks into one buffer. */
function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * Build a ZIP archive from text files.
 *
 * @param files Files to include (stored in the given order).
 * @returns The archive as a binary string, ready for a `Blob`.
 */
export async function createZip(files: readonly DownloadPayload[]): Promise<Blob> {
  const encoder = new TextEncoder()
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const rawData = utf8(file.content)
    const { data, method } = await deflateRaw(rawData)
    const checksum = crc32(rawData)

    // Local file header: signature, version, flags, method, time, date, sizes, name.
    const localHeader = new DataView(new ArrayBuffer(30))
    localHeader.setUint32(0, 0x04034b50, true) // local file header signature
    localHeader.setUint16(4, 20, true) // version needed
    localHeader.setUint16(6, 0x0800, true) // flags: UTF-8 names
    localHeader.setUint16(8, method, true)
    localHeader.setUint16(10, DOS_TIME, true)
    localHeader.setUint16(12, DOS_DATE, true)
    localHeader.setUint32(14, checksum, true)
    localHeader.setUint32(18, data.length, true) // compressed size
    localHeader.setUint32(22, rawData.length, true) // uncompressed size
    localHeader.setUint16(26, nameBytes.length, true)
    localHeader.setUint16(28, 0, true) // extra field length

    localChunks.push(new Uint8Array(localHeader.buffer), nameBytes, data)

    // Central directory entry repeats the metadata plus the local header offset.
    const centralHeader = new DataView(new ArrayBuffer(46))
    centralHeader.setUint32(0, 0x02014b50, true) // central directory signature
    centralHeader.setUint16(4, 20, true) // version made by
    centralHeader.setUint16(6, 20, true) // version needed
    centralHeader.setUint16(8, 0x0800, true) // flags: UTF-8 names
    centralHeader.setUint16(10, method, true)
    centralHeader.setUint16(12, DOS_TIME, true)
    centralHeader.setUint16(14, DOS_DATE, true)
    centralHeader.setUint32(16, checksum, true)
    centralHeader.setUint32(20, data.length, true)
    centralHeader.setUint32(24, rawData.length, true)
    centralHeader.setUint16(28, nameBytes.length, true)
    centralHeader.setUint16(30, 0, true) // extra field length
    centralHeader.setUint16(32, 0, true) // file comment length
    centralHeader.setUint16(34, 0, true) // disk number start
    centralHeader.setUint16(36, 0, true) // internal attributes
    centralHeader.setUint32(38, 0, true) // external attributes
    centralHeader.setUint32(42, offset, true) // relative offset of local header

    centralChunks.push(new Uint8Array(centralHeader.buffer), nameBytes)

    // Next entry starts after this entry's local header + name + data.
    offset += 30 + nameBytes.length + data.length
  }

  const centralDirectory = concat(centralChunks)

  // End of central directory record.
  const endRecord = new DataView(new ArrayBuffer(22))
  endRecord.setUint32(0, 0x06054b50, true) // end of central directory signature
  endRecord.setUint16(4, 0, true) // disk number
  endRecord.setUint16(6, 0, true) // disk with central directory
  endRecord.setUint16(8, files.length, true)
  endRecord.setUint16(10, files.length, true)
  endRecord.setUint32(12, centralDirectory.length, true)
  endRecord.setUint32(16, offset, true)
  endRecord.setUint16(20, 0, true) // comment length

  return new Blob(
    [concat(localChunks), centralDirectory, new Uint8Array(endRecord.buffer)] as BlobPart[],
    { type: 'application/zip' },
  )
}