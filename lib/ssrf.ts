/**
 * SSRF protection: block crawl requests aimed at loopback / private / link-local
 * addresses.
 *
 * The crawl API fetches whatever a visitor types, so without this it is an open
 * proxy into the host network (cloud metadata at 169.254.169.254 included).
 * Local development against 127.0.0.1 opts out with ALLOW_PRIVATE_TARGETS=1.
 *
 * SSRF 防護：攔截指向本機／內網／鏈路本地位址的抓取請求。
 * 抓取 API 會請求訪客輸入的任何位址，沒有這層就等於開放穿透內網的代理
 * （包含 169.254.169.254 的雲端中繼資料）。本機開發請以 ALLOW_PRIVATE_TARGETS=1 放行。
 */

/** Whether the env override is set. */
export function allowPrivateTargets(): boolean {
  const value = process.env.ALLOW_PRIVATE_TARGETS
  return value === '1' || value?.toLowerCase() === 'true'
}

/** Convert a dotted IPv4 into a 32-bit integer, or null when malformed. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let result = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet > 255) return null
    result = result * 256 + octet
  }
  return result
}

/**
 * Whether an IPv4 address falls into a private / reserved range.
 *
 * @param ip Dotted quad, e.g. `192.168.1.1`.
 */
export function isPrivateIPv4(ip: string): boolean {
  const value = ipv4ToInt(ip)
  if (value === null) return false

  const inRange = (start: string, end: string): boolean => {
    const from = ipv4ToInt(start)
    const to = ipv4ToInt(end)
    if (from === null || to === null) return false
    return value >= from && value <= to
  }

  return (
    inRange('0.0.0.0', '0.255.255.255') || // this network / 本網路
    inRange('10.0.0.0', '10.255.255.255') || // private A / 私有 A
    inRange('100.64.0.0', '100.127.255.255') || // carrier-grade NAT / 電信級 NAT
    inRange('127.0.0.0', '127.255.255.255') || // loopback / 回環
    inRange('169.254.0.0', '169.254.255.255') || // link-local (cloud metadata) / 鏈路本地
    inRange('172.16.0.0', '172.31.255.255') || // private B / 私有 B
    inRange('192.0.0.0', '192.0.0.255') || // IETF protocol assignments / IETF 保留
    inRange('192.168.0.0', '192.168.255.255') || // private C / 私有 C
    inRange('198.18.0.0', '198.19.255.255') || // benchmarking / 基準測試
    inRange('224.0.0.0', '239.255.255.255') || // multicast / 群播
    inRange('240.0.0.0', '255.255.255.255') // reserved + broadcast / 保留與廣播
  )
}

/**
 * Whether a hostname points at a private resource.
 *
 * @param hostname From `new URL(...).hostname` (IPv6 keeps its brackets).
 */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true
  }

  // Plain IPv4.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return isPrivateIPv4(host)

  // IPv4-mapped IPv6: ::ffff:127.0.0.1
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(host)
  if (mapped) return isPrivateIPv4(mapped[1])

  // IPv6.
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true
    if (/^fe[89ab]/.test(host)) return true // link-local fe80::/10 / 鏈路本地
    if (/^f[cd]/.test(host)) return true // unique-local fc00::/7 / 唯一本地
    return false
  }

  // A bare hostname (no dot) usually resolves inside the network.
  if (!host.includes('.')) return true

  return false
}

/**
 * Validate the crawl target; throws a Chinese error when not allowed.
 *
 * @param target The parsed target URL.
 * @returns The target hostname (for logging).
 */
export function assertAllowedTarget(target: URL): string {
  if (allowPrivateTargets()) return target.hostname

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('仅支持 http / https 协议')
  }
  if (isPrivateHostname(target.hostname)) {
    throw new Error(
      `出于 SSRF 防护，暂不允许抓取内网地址：${target.hostname}。本地测试请设置 ALLOW_PRIVATE_TARGETS=1`,
    )
  }
  return target.hostname
}