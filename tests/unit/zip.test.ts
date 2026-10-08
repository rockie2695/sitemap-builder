/**
 * Unit tests for `lib/export/zip.ts`.
 *
 * Runs in the Node environment: jsdom's `Blob` lacks `.stream()`, while Node 22 has
 * both `Blob.stream()` and `CompressionStream` natively. The archive is validated by
 * inflating it back with `inflateRawSync` — a stronger check than string compares.
 *
 * `lib/export/zip.ts` 的單元測試。
 * 在 Node 環境執行：jsdom 的 `Blob` 缺少 `.stream()`，而 Node 22 原生具備
 * `Blob.stream()` 與 `CompressionStream`。封存檔以 `inflateRawSync` 解壓回來驗證，
 * 比字串比對更強。
 *
 * @vitest-environment node
 */
import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { crc32, createZip } from '@/lib/export/zip'
import { supportsCompression } from '@/lib/export/download'

/** Read a uint32/uint16 out of a byte buffer at an offset. */
function u32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  )
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

describe('crc32 / CRC-32', () => {
  it('matches the well-known test vectors / 對照知名測試向量', () => {
    const encoder = new TextEncoder()
    expect(crc32(encoder.encode(''))).toBe(0)
    expect(crc32(encoder.encode('a'))).toBe(0xe8b7be43)
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('createZip / ZIP 封裝', () => {
  it('reports platform compression support / 回報平台壓縮支援', () => {
    expect(supportsCompression()).toBe(true) // Node 22 has CompressionStream
  })

  it('produces a valid ZIP that Node can inflate / 產生 Node 可解壓的合法 ZIP', async () => {
    const blob = await createZip([
      {
        name: 'sitemap.xml',
        content: '<?xml version="1.0"?><urlset></urlset>',
        mime: 'application/xml',
      },
      {
        name: 'sitemap-2.xml',
        content: '<?xml version="1.0"?><urlset><url><loc>a</loc></url></urlset>',
        mime: 'application/xml',
      },
    ])

    const bytes = new Uint8Array(await blob.arrayBuffer())

    // Local file header signature at offset 0.
    expect(u32(bytes, 0)).toBe(0x04034b50)
    // End-of-central-directory signature in the last 22 bytes.
    expect(u32(bytes, bytes.length - 22)).toBe(0x06054b50)

    // Entry count from the EOCD record.
    const entries = u16(bytes, bytes.length - 22 + 8)
    expect(entries).toBe(2)

    // Extract both entries by walking the local headers.
    let offset = 0
    const inflated: Array<{ name: string; content: string }> = []
    for (let i = 0; i < entries; i += 1) {
      expect(u32(bytes, offset)).toBe(0x04034b50)
      const compressedSize = u32(bytes, offset + 18)
      const nameLength = u16(bytes, offset + 26)
      const extraLength = u16(bytes, offset + 28)

      const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength))
      const data = bytes.slice(offset + 30 + nameLength, offset + 30 + nameLength + compressedSize)
      const raw = inflateRawSync(data)

      inflated.push({ name, content: raw.toString('utf8') })
      offset += 30 + nameLength + extraLength + compressedSize
    }

    expect(inflated.map((entry) => entry.name)).toEqual(['sitemap.xml', 'sitemap-2.xml'])
    expect(inflated[0].content).toBe('<?xml version="1.0"?><urlset></urlset>')
    expect(inflated[1].content).toContain('<loc>a</loc>')
  })

  it('stores tiny files uncompressed / 極小檔案不壓縮', async () => {
    const blob = await createZip([{ name: 'a.txt', content: 'x', mime: 'text/plain' }])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // Method 0 (stored) in the local header: deflating "x" would only grow it.
    expect(u16(bytes, 8)).toBe(0)
  })

  it('compresses larger files with DEFLATE / 較大檔案以 DEFLATE 壓縮', async () => {
    const big = '<?xml version="1.0"?>\n<urlset>\n' + '<url><loc>x</loc></url>\n'.repeat(500) + '</urlset>'
    const blob = await createZip([{ name: 'sitemap.xml', content: big, mime: 'application/xml' }])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // Method 8 (deflate) in the local header.
    expect(u16(bytes, 8)).toBe(8)
    // And the archive still inflates back to the original content.
    const nameLength = u16(bytes, 26)
    const compressedSize = u32(bytes, 18)
    const raw = inflateRawSync(bytes.slice(30 + nameLength, 30 + nameLength + compressedSize))
    expect(raw.toString('utf8')).toBe(big)
  })

  it('sets the UTF-8 filename flag / 設定 UTF-8 檔名旗標', async () => {
    const blob = await createZip([{ name: 'sitemap-1.xml', content: 'ok', mime: 'application/xml' }])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(u16(bytes, 6)).toBe(0x0800)
  })
})