import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LedgerDB, useDatabase } from './db/db'
import { ensureSettings, getSettings, updateSettings } from './db/repo'
import { fetchLatestRate, parseHacienda, parseOpenER, refreshRate } from './rates'

const hacienda = { dolar: true, venta: { fecha: '2026-11-04 00:00:00', valor: 512.83 }, compra: { fecha: '2026-11-04 00:00:00', valor: 506.12 } }
const openER = { result: 'success', time_last_update_unix: 1793750400, rates: { USD: 1, CRC: 510.4567 } }

const fakeFetch = (routes: Record<string, unknown | Error>) =>
  (async (url: string) => {
    const hit = Object.entries(routes).find(([k]) => String(url).startsWith(k))?.[1]
    if (!hit || hit instanceof Error) throw hit ?? new Error('offline')
    return { ok: true, status: 200, json: async () => hit } as Response
  }) as unknown as typeof fetch

let i = 0
beforeEach(async () => {
  useDatabase(new LedgerDB(`rates-${i++}`))
  await ensureSettings()
})

describe('exchange rate', () => {
  it('parses the BCCR sell rate from Hacienda', () => {
    expect(parseHacienda(hacienda)).toEqual({ rate: '512.83', source: 'BCCR (Hacienda)', date: '2026-11-04' })
    expect(parseHacienda({ venta: { valor: 'n/a' } })).toBeNull()
    expect(parseHacienda({ venta: { valor: 5 } })).toBeNull() // fails the sanity check
  })

  it('parses the fallback source', () => {
    expect(parseOpenER(openER)?.rate).toBe('510.46')
    expect(parseOpenER({ result: 'error' })).toBeNull()
  })

  it('falls back when the official source is unreachable', async () => {
    const r = await fetchLatestRate(fakeFetch({ 'https://api.hacienda.go.cr': new Error('CORS'), 'https://open.er-api.com': openER }))
    expect(r?.source).toBe('ExchangeRate-API')
    expect(await fetchLatestRate(fakeFetch({}))).toBeNull()
  })

  it('updates the saved rate, respects the 6-hour limit and the off switch', async () => {
    const f = fakeFetch({ 'https://api.hacienda.go.cr': hacienda })
    await refreshRate(false, f)
    let s = await getSettings()
    expect(s.crcPerUSD).toBe('512.83')
    expect(s.rateSource).toBe('BCCR (Hacienda)')

    // checked just now → skipped unless forced
    expect(await refreshRate(false, fakeFetch({ 'https://api.hacienda.go.cr': { venta: { valor: 600 } } }))).toBeNull()
    expect((await getSettings()).crcPerUSD).toBe('512.83')

    // off → never fetches automatically, keeps the hand-entered rate
    await updateSettings({ autoRate: false, crcPerUSD: '500', rateCheckedAt: null })
    expect(await refreshRate(false, f)).toBeNull()
    s = await getSettings()
    expect(s.crcPerUSD).toBe('500')
  })
})
