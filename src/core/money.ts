import Big from 'big.js'
import type { Cents, Currency } from './types'

// ---------- Conversion ----------

/**
 * Converts at an explicit rate (₡ per $1). Result is rounded half-up to whole cents.
 * Every conversion in the app goes through here so the rate used is always known.
 */
export function convert(amount: Cents, from: Currency, to: Currency, crcPerUSD: string | number): Cents {
  if (from === to) return amount
  const rate = new Big(crcPerUSD || 0)
  if (rate.lte(0)) return 0
  const v = from === 'USD' ? new Big(amount).times(rate) : new Big(amount).div(rate)
  return Number(v.round(0, Big.roundHalfUp))
}

/** Per-currency totals. Different currencies are never added together implicitly. */
export type Totals = Record<Currency, Cents>
export const emptyTotals = (): Totals => ({ CRC: 0, USD: 0 })
export function addTo(t: Totals, amount: Cents, c: Currency): Totals {
  t[c] += amount
  return t
}
export function sumTotals(...ts: Totals[]): Totals {
  const r = emptyTotals()
  for (const t of ts) { r.CRC += t.CRC; r.USD += t.USD }
  return r
}
export const nonZeroCurrencies = (t: Totals): Currency[] => (['CRC', 'USD'] as Currency[]).filter((c) => t[c] !== 0)
/** Explicit conversion of all currencies into one, at a stated rate. */
export function totalIn(t: Totals, target: Currency, crcPerUSD: string): Cents {
  return convert(t.CRC, 'CRC', target, crcPerUSD) + convert(t.USD, 'USD', target, crcPerUSD)
}

// ---------- Parsing ----------

/**
 * Parses user input like "12,500.50", "12.500,50", "12500", "₡ 3 500" into cents.
 * The last '.' or ',' followed by 1–2 digits is the decimal separator; others are thousands separators.
 */
export function parseAmount(raw: string): Cents | null {
  let s = (raw ?? '').replace(/[^0-9.,-]/g, '')
  if (!s) return null
  const negative = s.startsWith('-')
  s = s.replace(/-/g, '')
  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (last >= 0) {
    const sep = s[last]
    const fraction = s.slice(last + 1)
    const sameSepCount = s.split(sep).length - 1
    const sepCount = (s.match(/[.,]/g) ?? []).length
    if (fraction.length <= 2 && !(sepCount > 1 && sameSepCount > 1)) {
      s = s.slice(0, last).replace(/[^0-9]/g, '') + '.' + fraction
    } else {
      s = s.replace(/[^0-9]/g, '')
    }
  }
  if (s === '' || s === '.') return null
  try {
    const cents = Number(new Big(s.endsWith('.') ? s + '0' : s.startsWith('.') ? '0' + s : s).times(100).round(0, Big.roundHalfUp))
    return negative ? -cents : cents
  } catch {
    return null
  }
}

/** Parses a positive decimal rate string; returns normalized string or null. */
export function parseRate(raw: string): string | null {
  const c = parseAmount(raw)
  if (c === null || c <= 0) return null
  return new Big(c).div(100).toString()
}

/**
 * Formats an amount while it's being typed: "1250000.5" → "1,250,000.5".
 * Decimal separator is "."; a trailing comma followed by 0–2 digits (as typed on a
 * Spanish-locale keyboard) is treated as the decimal separator too — unless the user is
 * deleting (`commaMayBeDecimal = false`), so "1,234" → backspace → "1,23" becomes "123". Idempotent.
 */
export function groupInput(raw: string, commaMayBeDecimal = true): string {
  let s = (raw ?? '').replace(/[^0-9.,]/g, '')
  if (!s) return ''
  let decimalAt = s.lastIndexOf('.')
  if (decimalAt < 0 && commaMayBeDecimal && /,\d{0,2}$/.test(s)) decimalAt = s.lastIndexOf(',')
  let int = decimalAt >= 0 ? s.slice(0, decimalAt) : s
  const frac = decimalAt >= 0 ? s.slice(decimalAt + 1).replace(/[^0-9]/g, '').slice(0, 2) : null
  int = int.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
  if (int === '' && frac !== null) int = '0'
  s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac !== null ? `${s}.${frac}` : s
}

/** onChange helper for amount fields: groups digits, aware of whether the user is typing or deleting. */
export function nextInput(previous: string, typed: string): string {
  return groupInput(typed, typed.length >= groupInput(previous).length)
}

/** Cents → editable string with thousands separators ("12,500.5"). */
export const toInput = (c: Cents | null | undefined): string => (c == null ? '' : groupInput(new Big(c).div(100).toString()))

// ---------- Formatting ----------

export const SYMBOL: Record<Currency, string> = { CRC: '₡', USD: '$' }
export const DISPLAY_DIGITS: Record<Currency, number> = { CRC: 0, USD: 2 }
export const CURRENCY_NAME: Record<Currency, string> = { CRC: 'Costa Rican colón', USD: 'US dollar' }

const fmtCache = new Map<number, Intl.NumberFormat>()
function nf(digits: number) {
  let f = fmtCache.get(digits)
  if (!f) {
    f = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    fmtCache.set(digits, f)
  }
  return f
}

/** "₡1,250,000" · "$1,250.50" · "−$20.00" · "+₡5,000" (signed) */
export function formatMoney(c: Cents, currency: Currency, opts: { signed?: boolean } = {}): string {
  const digits = DISPLAY_DIGITS[currency]
  const magnitude = Math.abs(c) / 100
  const rounded = digits === 0 ? Number(new Big(Math.abs(c)).div(100).round(0, Big.roundHalfUp)) : magnitude
  const sign = c < 0 ? '−' : opts.signed && c > 0 ? '+' : ''
  return `${sign}${SYMBOL[currency]}${nf(digits).format(rounded)}`
}

/** Compact for chart labels: "₡1.2M", "$350K". */
export function formatCompact(c: Cents, currency: Currency): string {
  const v = c / 100
  const a = Math.abs(v)
  const sign = v < 0 ? '−' : ''
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '')
  if (a >= 1e9) return `${sign}${SYMBOL[currency]}${trim(a / 1e9)}B`
  if (a >= 1e6) return `${sign}${SYMBOL[currency]}${trim(a / 1e6)}M`
  if (a >= 1e3) return `${sign}${SYMBOL[currency]}${trim(a / 1e3)}K`
  return `${sign}${SYMBOL[currency]}${Math.round(a)}`
}

export function formatPercent(ratio: number | null, digits = 0): string {
  if (ratio === null || !isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(digits)}%`
}

export const HIDDEN = '••••••'
