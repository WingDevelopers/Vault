import type { ISODate, MonthKey } from './types'

// All dates are local calendar dates ("YYYY-MM-DD"), compared as strings. No time zones involved.

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const today = (): ISODate => toISODate(new Date())

export function parts(d: ISODate): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number)
  return [y, m, day]
}

export const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate()

export const monthKey = (d: ISODate): MonthKey => d.slice(0, 7)
export const currentMonth = (): MonthKey => monthKey(today())
export const monthStart = (m: MonthKey): ISODate => `${m}-01`
export function monthEnd(m: MonthKey): ISODate {
  const [y, mm] = m.split('-').map(Number)
  return `${m}-${pad(daysInMonth(y, mm))}`
}

export function addMonthsToKey(m: MonthKey, n: number): MonthKey {
  const [y, mm] = m.split('-').map(Number)
  const total = y * 12 + (mm - 1) + n
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`
}

/** Adds months, clamping the day to the target month's length (Jan 31 + 1 → Feb 28/29). */
export function addMonths(d: ISODate, n: number): ISODate {
  const [y, m, day] = parts(d)
  const key = addMonthsToKey(`${y}-${pad(m)}`, n)
  const [ny, nm] = key.split('-').map(Number)
  return `${key}-${pad(Math.min(day, daysInMonth(ny, nm)))}`
}

export function addDays(d: ISODate, n: number): ISODate {
  const [y, m, day] = parts(d)
  return toISODate(new Date(y, m - 1, day + n))
}

export function monthsBetween(a: MonthKey, b: MonthKey): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/** Inclusive date range. */
export interface DateRange { start: ISODate; end: ISODate }
export const inRange = (d: ISODate, r: DateRange) => d >= r.start && d <= r.end
export const monthRange = (m: MonthKey): DateRange => ({ start: monthStart(m), end: monthEnd(m) })

const dateFrom = (d: ISODate) => { const [y, m, day] = parts(d); return new Date(y, m - 1, day) }

export const fmtMonth = (m: MonthKey, style: 'long' | 'short' = 'long') =>
  dateFrom(monthStart(m)).toLocaleDateString('en-US', { month: style, year: 'numeric' })
export const fmtMonthShort = (m: MonthKey) => dateFrom(monthStart(m)).toLocaleDateString('en-US', { month: 'short' })
export const fmtDay = (d: ISODate) => dateFrom(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
export const fmtDate = (d: ISODate) => dateFrom(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
export function fmtDayHeader(d: ISODate): string {
  if (d === today()) return 'Today'
  if (d === addDays(today(), -1)) return 'Yesterday'
  return dateFrom(d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}
