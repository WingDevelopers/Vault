// Keeps the ₡/$ exchange rate current.
// This is the app's only network request: it downloads the public exchange rate.
// No personal or financial data is ever sent. Offline or on failure it does nothing.

import { today } from './core/dates'
import { getSettings, updateSettings } from './db/repo'

export interface RateResult { rate: string; source: string; date: string }

const STALE_MS = 6 * 60 * 60 * 1000 // check at most every 6 hours

const sane = (n: unknown): n is number => typeof n === 'number' && isFinite(n) && n > 100 && n < 2000
const fmt = (n: number) => n.toFixed(2)

/** Official BCCR reference rate (sell), published through Costa Rica's Ministerio de Hacienda API. */
export function parseHacienda(json: unknown): RateResult | null {
  const v = (json as { venta?: { valor?: unknown; fecha?: unknown } })?.venta
  if (!v || !sane(v.valor)) return null
  const date = typeof v.fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.fecha) ? v.fecha.slice(0, 10) : today()
  return { rate: fmt(v.valor), source: 'BCCR (Hacienda)', date }
}

/** Fallback: open.er-api.com daily mid-market rate. */
export function parseOpenER(json: unknown): RateResult | null {
  const j = json as { result?: string; rates?: Record<string, unknown>; time_last_update_unix?: number }
  if (j?.result !== 'success' || !sane(j.rates?.CRC)) return null
  const date = j.time_last_update_unix ? new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10) : today()
  return { rate: fmt(j.rates!.CRC as number), source: 'ExchangeRate-API', date }
}

async function getJSON(url: string, fetcher: typeof fetch): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const r = await fetcher(url, { signal: ctrl.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(t)
  }
}

export async function fetchLatestRate(fetcher: typeof fetch = fetch): Promise<RateResult | null> {
  const sources: [string, (j: unknown) => RateResult | null][] = [
    ['https://api.hacienda.go.cr/indicadores/tc/dolar', parseHacienda],
    ['https://open.er-api.com/v6/latest/USD', parseOpenER],
  ]
  for (const [url, parse] of sources) {
    try {
      const r = parse(await getJSON(url, fetcher))
      if (r) return r
    } catch { /* try the next source */ }
  }
  return null
}

let inFlight: Promise<RateResult | null> | null = null

/** Updates the saved rate if automatic updates are on and the last check is old. `force` ignores the 6-hour limit. */
export function refreshRate(force = false, fetcher: typeof fetch = fetch): Promise<RateResult | null> {
  if (inFlight) return inFlight
  inFlight = (async () => {
    const s = await getSettings()
    if (!force && (!s.autoRate || (s.rateCheckedAt && Date.now() - s.rateCheckedAt < STALE_MS))) return null
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
    const r = await fetchLatestRate(fetcher)
    if (r) await updateSettings({ crcPerUSD: r.rate, rateUpdatedAt: r.date, rateSource: r.source, rateCheckedAt: Date.now() })
    return r
  })().finally(() => { inFlight = null })
  return inFlight
}
