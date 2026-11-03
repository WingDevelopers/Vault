import { addTo, convert, emptyTotals, sumTotals, totalIn, type Totals } from './money'
import { addDays, addMonths, addMonthsToKey, currentMonth, daysInMonth, inRange, monthEnd, monthKey, monthRange, monthsBetween, today, type DateRange } from './dates'
import {
  isAvailableCash,
  type Account, type AssetType, type Cents, type Contribution, type Currency, type FinanceData, type Frequency,
  type GoalContribution, type ISODate, type Investment, type MonthKey, type PayDays, type Transaction,
  DEFAULT_PAYDAYS,
} from './types'

// ============================================================================
// Ledger: balances, period summaries, net worth
//
// Rules
// - Transfers move money between accounts and never count as income or expense.
// - Investment contributions move money from a source account into a holding:
//   the account goes down, the investment goes up, net worth is unchanged (no double counting).
// - Foreign-currency amounts convert at the rate recorded with each transaction.
// - Different currencies are only combined through an explicit rate.
// ============================================================================

export type Ledger = Pick<FinanceData, 'accounts' | 'transactions' | 'investments' | 'contributions' | 'valuations' | 'settings'>

/** Signed effect of a transaction on an account, in the account's currency. */
export function txEffect(t: Transaction, a: Account): Cents {
  const conv = () => convert(t.amount, t.currency, a.currency, t.rate)
  let delta = 0
  if (t.kind === 'income' && t.accountId === a.id) delta += conv()
  if (t.kind === 'expense' && t.accountId === a.id) delta -= conv()
  if (t.kind === 'transfer') {
    if (t.accountId === a.id) delta -= conv()
    if (t.destAccountId === a.id) delta += t.destAmount ?? conv()
  }
  return delta
}

export function contributionEffect(c: Contribution, inv: Investment | undefined, a: Account): Cents {
  if (c.sourceAccountId !== a.id || !inv) return 0
  return -convert(c.amount, inv.currency, a.currency, c.rate)
}

/** Balance at the end of `asOf` (inclusive). Omit for all time. */
export function balance(a: Account, l: Ledger, asOf?: ISODate): Cents {
  const cutoff = asOf ?? '9999-12-31'
  if (a.openingDate > cutoff) return 0
  let total = a.openingBalance
  for (const t of l.transactions) if (t.date <= cutoff) total += txEffect(t, a)
  const invById = new Map(l.investments.map((i) => [i.id, i]))
  for (const c of l.contributions) if (c.date <= cutoff) total += contributionEffect(c, invById.get(c.investmentId), a)
  return total
}

export interface PeriodSummary {
  income: Cents
  expenses: Cents
  savings: Cents
  /** savings / income, or null without income */
  savingsRate: number | null
  currency: Currency
  includesConversions: boolean
}

export function summary(transactions: Transaction[], range: DateRange, target: Currency, accountId?: string): PeriodSummary {
  let income = 0, expenses = 0, conv = false
  for (const t of transactions) {
    if (t.kind === 'transfer' || !inRange(t.date, range)) continue
    if (accountId && t.accountId !== accountId) continue
    if (t.currency !== target) conv = true
    const v = convert(t.amount, t.currency, target, t.rate)
    if (t.kind === 'income') income += v
    else expenses += v
  }
  const savings = income - expenses
  return { income, expenses, savings, savingsRate: income > 0 ? savings / income : null, currency: target, includesConversions: conv }
}

/** Expense totals per category id ('' = uncategorized), converted at recorded rates. */
export function expensesByCategory(transactions: Transaction[], range: DateRange, target: Currency): Map<string, Cents> {
  const m = new Map<string, Cents>()
  for (const t of transactions) {
    if (t.kind !== 'expense' || !inRange(t.date, range)) continue
    const key = t.categoryId ?? ''
    m.set(key, (m.get(key) ?? 0) + convert(t.amount, t.currency, target, t.rate))
  }
  return m
}

export interface NetWorth {
  availableCash: Totals
  otherAccounts: Totals
  investments: Totals
  total: Totals
}

export function netWorth(l: Ledger, asOf?: ISODate): NetWorth {
  const availableCash = emptyTotals(), otherAccounts = emptyTotals(), investments = emptyTotals()
  for (const a of l.accounts) addTo(isAvailableCash(a.kind) ? availableCash : otherAccounts, balance(a, l, asOf), a.currency)
  for (const inv of l.investments) addTo(investments, investmentValue(inv, l, asOf), inv.currency)
  return { availableCash, otherAccounts, investments, total: sumTotals(availableCash, otherAccounts, investments) }
}

export interface Point { month: MonthKey; value: Cents; secondary?: Cents }

function monthsWindow(n: number, now: ISODate): MonthKey[] {
  const cur = monthKey(now)
  return Array.from({ length: n }, (_, i) => addMonthsToKey(cur, i - (n - 1)))
}
const monthCutoff = (m: MonthKey, now: ISODate) => (m === monthKey(now) ? now : monthEnd(m))

/** Month-end net worth, converted at the current rate (stated in the UI). */
export function netWorthHistory(l: Ledger, months = 12, now: ISODate = today()): Point[] {
  const target = l.settings.primaryCurrency
  const dates = [...l.accounts.map((a) => a.openingDate), ...l.transactions.map((t) => t.date), ...l.contributions.map((c) => c.date)]
  if (!dates.length) return []
  const first = monthKey(dates.reduce((a, b) => (a < b ? a : b)))
  return monthsWindow(months, now)
    .filter((m) => m >= first)
    .map((m) => ({ month: m, value: totalIn(netWorth(l, monthCutoff(m, now)).total, target, l.settings.crcPerUSD) }))
}

// ============================================================================
// Portfolio — contributions are kept separate from performance.
// Value at a date = last valuation on/before it + net contributions made after that valuation.
// So a deposit raises value AND invested capital equally, and never shows up as a gain.
// ============================================================================

type PortfolioData = Pick<FinanceData, 'contributions' | 'valuations'>

export function netContributions(invId: string, d: PortfolioData, asOf = '9999-12-31'): Cents {
  return d.contributions.filter((c) => c.investmentId === invId && c.date <= asOf).reduce((s, c) => s + c.amount, 0)
}

export function latestValuation(invId: string, d: PortfolioData, asOf = '9999-12-31') {
  let best: PortfolioData['valuations'][number] | undefined
  for (const v of d.valuations) {
    if (v.investmentId !== invId || v.date > asOf) continue
    if (!best || v.date > best.date || (v.date === best.date && v.id > best.id)) best = v
  }
  return best
}

export function investmentValue(inv: Investment, d: PortfolioData, asOf = '9999-12-31'): Cents {
  const last = latestValuation(inv.id, d, asOf)
  if (!last) return netContributions(inv.id, d, asOf)
  const after = d.contributions
    .filter((c) => c.investmentId === inv.id && c.date > last.date && c.date <= asOf)
    .reduce((s, c) => s + c.amount, 0)
  return last.value + after
}

export interface Holding {
  investment: Investment
  netContributions: Cents
  value: Cents
  hasMarketValue: boolean
  lastValuationDate: ISODate | null
  gain: Cents | null
  gainPct: number | null
}

export function holding(inv: Investment, d: PortfolioData): Holding {
  const last = latestValuation(inv.id, d)
  const contributed = netContributions(inv.id, d)
  const value = investmentValue(inv, d)
  const gain = last ? value - contributed : null
  return {
    investment: inv, netContributions: contributed, value, hasMarketValue: !!last, lastValuationDate: last?.date ?? null,
    gain, gainPct: gain !== null && contributed > 0 ? gain / contributed : null,
  }
}

export interface PortfolioTotals { contributed: Totals; value: Totals; gain: Totals; basisWithValue: Totals; valuedCount: number }

export function portfolioTotals(investments: Investment[], d: PortfolioData): PortfolioTotals {
  const t: PortfolioTotals = { contributed: emptyTotals(), value: emptyTotals(), gain: emptyTotals(), basisWithValue: emptyTotals(), valuedCount: 0 }
  for (const inv of investments) {
    const h = holding(inv, d)
    addTo(t.contributed, h.netContributions, inv.currency)
    addTo(t.value, h.value, inv.currency)
    if (h.gain !== null) {
      addTo(t.gain, h.gain, inv.currency)
      addTo(t.basisWithValue, h.netContributions, inv.currency)
      t.valuedCount++
    }
  }
  return t
}

export function allocation(investments: Investment[], d: PortfolioData, target: Currency, rate: string): { type: AssetType; value: Cents }[] {
  const m = new Map<AssetType, Cents>()
  for (const inv of investments) m.set(inv.assetType, (m.get(inv.assetType) ?? 0) + convert(investmentValue(inv, d), inv.currency, target, rate))
  return [...m.entries()].filter(([, v]) => v > 0).map(([type, value]) => ({ type, value })).sort((a, b) => b.value - a.value)
}

/** Month-end value (value) and cumulative contributions (secondary), in `target` at the current rate. */
export function portfolioHistory(investments: Investment[], d: PortfolioData, target: Currency, rate: string, months = 12, now = today()): Point[] {
  const ids = new Set(investments.map((i) => i.id))
  const dates = [...d.contributions.filter((c) => ids.has(c.investmentId)).map((c) => c.date), ...d.valuations.filter((v) => ids.has(v.investmentId)).map((v) => v.date)]
  if (!dates.length) return []
  const first = monthKey(dates.reduce((a, b) => (a < b ? a : b)))
  return monthsWindow(months, now).filter((m) => m >= first).map((m) => {
    const cutoff = monthCutoff(m, now)
    let value = 0, contributed = 0
    for (const inv of investments) {
      value += convert(investmentValue(inv, d, cutoff), inv.currency, target, rate)
      contributed += convert(netContributions(inv.id, d, cutoff), inv.currency, target, rate)
    }
    return { month: m, value, secondary: contributed }
  })
}

// ============================================================================
// Budgets
// ============================================================================

export type BudgetStatus = 'comfortable' | 'approaching' | 'over'

export interface BudgetProgress {
  budgeted: Cents
  carriedOver: Cents
  spent: Cents
  available: Cents
  remaining: Cents
  fraction: number
  status: BudgetStatus
}

export function makeProgress(budgeted: Cents, carriedOver: Cents, spent: Cents): BudgetProgress {
  const available = budgeted + carriedOver
  const remaining = available - spent
  const fraction = available > 0 ? spent / available : spent > 0 ? 1 : 0
  const status: BudgetStatus = remaining < 0 ? 'over' : fraction >= 0.8 ? 'approaching' : 'comfortable'
  return { budgeted, carriedOver, spent, available, remaining, fraction, status }
}

/**
 * Progress for `month`. With rollover, unused money carries forward from `startMonth`;
 * overspending never carries forward as debt. Without rollover, each month starts fresh.
 */
export function budgetProgress(amount: Cents, month: MonthKey, startMonth: MonthKey, rollover: boolean, spentIn: (m: MonthKey) => Cents): BudgetProgress {
  let carry = 0
  if (rollover) {
    let cursor = startMonth
    for (let i = 0; cursor < month && i < 240; i++) {
      carry = Math.max(0, amount + carry - spentIn(cursor))
      cursor = addMonthsToKey(cursor, 1)
    }
  }
  return makeProgress(amount, carry, spentIn(month))
}

// ============================================================================
// Goals
// ============================================================================

export interface GoalProjection {
  target: Cents
  allocated: Cents
  remaining: Cents
  fraction: number
  isComplete: boolean
  monthlyPace: Cents | null
  paceIsPlanned: boolean
  estimatedCompletion: MonthKey | null
  requiredMonthly: Cents | null
  onTrack: boolean | null
}

export function projectGoal(target: Cents, contributions: GoalContribution[], plannedMonthly: Cents | null, targetDate: ISODate | null, now = today()): GoalProjection {
  const allocated = contributions.reduce((s, c) => s + c.amount, 0)
  const remaining = Math.max(0, target - allocated)
  let pace: Cents | null = null
  let planned = false
  if (plannedMonthly && plannedMonthly > 0) {
    pace = plannedMonthly
    planned = true
  } else {
    const windowStart = addMonths(now, -3)
    const recent = contributions.filter((c) => c.date > windowStart && c.date <= now).reduce((s, c) => s + c.amount, 0)
    if (recent > 0) pace = Math.round(recent / 3)
  }
  let est: MonthKey | null = null
  if (remaining === 0) est = monthKey(now)
  else if (pace && pace > 0) est = addMonthsToKey(monthKey(now), Math.ceil(remaining / pace))

  let required: Cents | null = null
  if (targetDate && remaining > 0) {
    const months = Math.max(1, monthsBetween(monthKey(now), monthKey(targetDate)))
    required = Math.ceil(remaining / months)
  }
  const onTrack = targetDate && est ? est <= monthKey(targetDate) : null
  return {
    target, allocated, remaining, fraction: target > 0 ? Math.min(1, Math.max(0, allocated / target)) : 0,
    isComplete: target > 0 && allocated >= target, monthlyPace: pace, paceIsPlanned: planned,
    estimatedCompletion: est, requiredMonthly: required, onTrack,
  }
}

// ============================================================================
// Recurrence — occurrence n is always computed from the start date, so month-end dates don't drift.
// ============================================================================

function semimonthlyRaw(k: number, firstMonth: MonthKey, days: PayDays): ISODate {
  const month = addMonthsToKey(firstMonth, Math.floor(k / 2))
  const [y, m] = month.split('-').map(Number)
  const day = Math.min(days[k % 2], daysInMonth(y, m))
  return `${month}-${String(day).padStart(2, '0')}`
}

export function occurrence(n: number, start: ISODate, f: Frequency, days: PayDays | null = null): ISODate {
  switch (f) {
    case 'semimonthly': {
      // Paydays on two fixed days each month, starting with the first payday on/after `start`.
      const d: PayDays = days ?? DEFAULT_PAYDAYS
      const first = monthKey(start)
      let offset = 0
      while (offset < 2 && semimonthlyRaw(offset, first, d) < start) offset++
      return semimonthlyRaw(n + offset, first, d)
    }
    case 'weekly': return addDays(start, 7 * n)
    case 'biweekly': return addDays(start, 14 * n)
    case 'monthly': return addMonths(start, n)
    case 'yearly': return addMonths(start, 12 * n)
  }
}

/** Occurrences due on or before `now`, starting at index `from`. */
export function dueOccurrences(start: ISODate, f: Frequency, from: number, end: ISODate | null, now = today(), limit = 400, days: PayDays | null = null) {
  const out: { index: number; date: ISODate }[] = []
  for (let i = from; out.length < limit; i++) {
    const d = occurrence(i, start, f, days)
    if (d > now || (end && d > end)) break
    out.push({ index: i, date: d })
  }
  return out
}

export function nextOccurrence(start: ISODate, f: Frequency, index: number, end: ISODate | null, days: PayDays | null = null): ISODate | null {
  const d = occurrence(index, start, f, days)
  return end && d > end ? null : d
}

export function monthlyEquivalent(amount: Cents, f: Frequency): Cents {
  switch (f) {
    case 'weekly': return Math.round((amount * 52) / 12)
    case 'biweekly': return Math.round((amount * 26) / 12)
    case 'semimonthly': return amount * 2
    case 'monthly': return amount
    case 'yearly': return Math.round(amount / 12)
  }
}

export { currentMonth, monthRange }
