/**
 * Unit tests for `lib/ssrf.ts`: private-host detection and the env override.
 *
 * `lib/ssrf.ts` 的單元測試：私有位址判定與環境變數開關。
 */
import { afterEach, describe, expect, it } from 'vitest'

import { assertAllowedTarget, isPrivateHostname, isPrivateIPv4 } from '@/lib/ssrf'

/** Restore the env override after each test. */
afterEach(() => {
  delete process.env.ALLOW_PRIVATE_TARGETS
})

describe('isPrivateIPv4 / IPv4 私有網段', () => {
  it('flags loopback, private and link-local ranges / 標記回環、私有與鏈路本地網段', () => {
    expect(isPrivateIPv4('127.0.0.1')).toBe(true)
    expect(isPrivateIPv4('10.1.2.3')).toBe(true)
    expect(isPrivateIPv4('172.16.0.1')).toBe(true)
    expect(isPrivateIPv4('172.31.255.255')).toBe(true)
    expect(isPrivateIPv4('192.168.1.1')).toBe(true)
    expect(isPrivateIPv4('169.254.169.254')).toBe(true)
    expect(isPrivateIPv4('0.0.0.0')).toBe(true)
  })

  it('leaves public addresses alone / 公網位址不受影響', () => {
    expect(isPrivateIPv4('8.8.8.8')).toBe(false)
    expect(isPrivateIPv4('172.32.0.1')).toBe(false)
    expect(isPrivateIPv4('169.255.0.1')).toBe(false)
  })

  it('rejects malformed input / 拒絕畸形輸入', () => {
    expect(isPrivateIPv4('999.1.1.1')).toBe(false)
    expect(isPrivateIPv4('1.2.3')).toBe(false)
    expect(isPrivateIPv4('not-an-ip')).toBe(false)
  })
})

describe('isPrivateHostname / 主機名判定', () => {
  it('flags localhost variants and bare hostnames / 標記 localhost 變體與裸主機名', () => {
    expect(isPrivateHostname('localhost')).toBe(true)
    expect(isPrivateHostname('api.localhost')).toBe(true)
    expect(isPrivateHostname('myservice.local')).toBe(true)
    expect(isPrivateHostname('internal-svc')).toBe(true)
  })

  it('flags IPv6 loopback and unique-local / 標記 IPv6 回環與唯一本地位址', () => {
    expect(isPrivateHostname('[::1]')).toBe(true)
    expect(isPrivateHostname('::1')).toBe(true)
    expect(isPrivateHostname('fd00::1')).toBe(true)
    expect(isPrivateHostname('fe80::1')).toBe(true)
  })

  it('flags IPv4-mapped IPv6 / 標記 IPv4-mapped IPv6', () => {
    expect(isPrivateHostname('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateHostname('::ffff:8.8.8.8')).toBe(false)
  })

  it('leaves public hostnames alone / 公網主機名不受影響', () => {
    expect(isPrivateHostname('example.com')).toBe(false)
    expect(isPrivateHostname('www.example.com')).toBe(false)
  })
})

describe('assertAllowedTarget / SSRF 政策', () => {
  it('throws for private targets with a Chinese message / 私有目標擲出中文錯誤', () => {
    expect(() => assertAllowedTarget(new URL('http://localhost:4321/test/'))).toThrow(/SSRF/)
    expect(() => assertAllowedTarget(new URL('http://169.254.169.254/'))).toThrow(/169\.254\.169\.254/)
  })

  it('allows public targets / 允許公網目標', () => {
    expect(assertAllowedTarget(new URL('https://example.com/'))).toBe('example.com')
  })

  it('allows everything when the env override is set / 設定環境變數後全部放行', () => {
    process.env.ALLOW_PRIVATE_TARGETS = '1'
    expect(assertAllowedTarget(new URL('http://localhost:4321/test/'))).toBe('localhost')
    expect(assertAllowedTarget(new URL('http://192.168.1.1/'))).toBe('192.168.1.1')
  })

  it('accepts "true" as the override value / 也接受 true 字串', () => {
    process.env.ALLOW_PRIVATE_TARGETS = 'true'
    expect(assertAllowedTarget(new URL('http://127.0.0.1/'))).toBe('127.0.0.1')
  })
})