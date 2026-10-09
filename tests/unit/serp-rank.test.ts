/**
 * Unit tests for SERP host normalization and rank lookup.
 *
 * SERP 主機正規化與排名查找的單元測試。
 */
import { describe, expect, it } from 'vitest'

import { dedupeResults, findRank, isSameSite, normalizeHost, pickCompetitors } from '@/lib/serp/rank'
import type { SerpResult } from '@/types/serp'

/** A result at a given position. */
function result(position: number, url: string, hostname: string): SerpResult {
  return { position, url, title: `T${position}`, hostname }
}

describe('normalizeHost / 正規化主機', () => {
  it('lower-cases and strips www / 轉小寫並去除 www', () => {
    expect(normalizeHost('WWW.Example.COM')).toBe('example.com')
    expect(normalizeHost('blog.example.com')).toBe('blog.example.com')
  })
})

describe('findRank / 查找排名', () => {
  const results = [
    result(1, 'https://competitor.com/', 'competitor.com'),
    result(2, 'https://www.oursite.com/page', 'www.oursite.com'),
    result(3, 'https://other.com/', 'other.com'),
  ]

  it('matches on host, ignoring www / 以主機比對、忽略 www', () => {
    expect(findRank(results, 'https://oursite.com/other-page')).toBe(2)
  })

  it('returns null when absent / 不在結果中回傳 null', () => {
    expect(findRank(results, 'https://missing.com/')).toBeNull()
  })

  it('tolerates an invalid target / 容忍非法網址', () => {
    expect(findRank(results, 'not-a-url')).toBeNull()
    expect(isSameSite(results[0], 'not-a-url')).toBe(false)
  })
})

describe('dedupeResults / 去重', () => {
  it('drops duplicates and renumbers / 去除重複並重新編號', () => {
    const deduped = dedupeResults([
      result(1, 'https://a.com/', 'a.com'),
      result(2, 'https://a.com/', 'a.com'),
      result(3, 'https://b.com/', 'b.com'),
    ])
    expect(deduped.map((entry) => entry.url)).toEqual(['https://a.com/', 'https://b.com/'])
    expect(deduped.map((entry) => entry.position)).toEqual([1, 2])
  })
})

describe('pickCompetitors / 挑選競品', () => {
  const results = [
    result(1, 'https://oursite.com/', 'oursite.com'),
    result(2, 'https://c1.com/', 'c1.com'),
    result(3, 'https://c2.com/', 'c2.com'),
  ]

  it('excludes our own site and respects the limit / 排除自家並遵守上限', () => {
    const picked = pickCompetitors(results, 'https://oursite.com/page', 1)
    expect(picked).toHaveLength(1)
    expect(picked[0].hostname).toBe('c1.com')
  })

  it('returns nothing when the limit is zero / 上限為零時回傳空陣列', () => {
    expect(pickCompetitors(results, 'https://oursite.com/', 0)).toEqual([])
  })
})