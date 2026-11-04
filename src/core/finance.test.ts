import { describe, expect, it } from 'vitest'
import { convert, formatMoney, groupInput, nextInput, parseAmount, toInput, totalIn } from './money'
import { addMonths, monthRange } from './dates'
import {
  balance, budgetProgress, dueOccurrences, expectedIncome, reminderDue, reminderState, expensesByCategory, holding, netWorth, netWorthHistory, projectGoal, summary, type Ledger,
} from './finance'
import type { Account, Contribution, Investment, Settings, Transaction } from './types'

const settings: Settings = {
  id: 'app', primaryCurrency: 'CRC', crcPerUSD: '500', rateUpdatedAt: '2026-01-01', monthlyAllowance: null, onboarded: true,
  displayCurrency: null, allowanceCurrency: null, autoRate: false, rateSource: null, rateCheckedAt: null, hideAmounts: false, isDemo: false, lastAccountId: null, lock: { enabled: false, pinHash: null, pinSalt: null, credentialId: null },
}
const acct = (id: string, currency: 'CRC' | 'USD', opening: number, kind: Account['kind'] = 'bank'): Account => ({
  id, name: id, kind, currency, openingBalance: opening, openingDate: '2026-01-01', archived: false, sortOrder: 0, createdAt: 0,
})
const col = (n: number) => n * 100 // colones → cents
let n = 0
const tx = (p: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount' | 'accountId' | 'date'>): Transaction => ({
  id: `t${n++}`, currency: 'CRC', destAccountId: null, destAmount: null, categoryId: null, rate: '500', note: '', ruleId: null, createdAt: 0, ...p,
})
function ledger(p: Partial<Ledger> = {}): Ledger {
  return {
    settings,
    accounts: [acct('bank', 'CRC', col(1_000_000)), acct('savings', 'CRC', 0, 'savings'), acct('usd', 'USD', 100_00, 'savings')],
    transactions: [], investments: [], contributions: [], valuations: [], ...p,
  }
}

describe('ledger', () => {
  it('treats transfers as neither income nor expense', () => {
    const l = ledger({
      transactions: [
        tx({ kind: 'income', amount: col(500_000), accountId: 'bank', date: '2026-03-01' }),
        tx({ kind: 'expense', amount: col(120_000), accountId: 'bank', date: '2026-03-05' }),
        tx({ kind: 'transfer', amount: col(200_000), accountId: 'bank', destAccountId: 'savings', date: '2026-03-06' }),
      ],
    })
    const s = summary(l.transactions, monthRange('2026-03'), 'CRC')
    expect(s.income).toBe(col(500_000))
    expect(s.expenses).toBe(col(120_000))
    expect(s.savingsRate).toBeCloseTo(0.76)
    expect(balance(l.accounts[0], l)).toBe(col(1_180_000))
    expect(balance(l.accounts[1], l)).toBe(col(200_000))
    expect(netWorth(l).total).toEqual({ CRC: col(1_380_000), USD: 100_00 })
  })

  it('has no savings rate without income', () => {
    const s = summary([tx({ kind: 'expense', amount: 100, accountId: 'bank', date: '2026-03-05' })], monthRange('2026-03'), 'CRC')
    expect(s.savingsRate).toBeNull()
  })

  it('credits the received amount on cross-currency transfers', () => {
    const l = ledger({ transactions: [tx({ kind: 'transfer', amount: col(101_000), accountId: 'bank', destAccountId: 'usd', destAmount: 200_00, date: '2026-02-01' })] })
    expect(balance(l.accounts[0], l)).toBe(col(899_000))
    expect(balance(l.accounts[2], l)).toBe(300_00)
  })

  it('converts foreign expenses at the recorded rate, not the current one', () => {
    const l = ledger({ settings: { ...settings, crcPerUSD: '600' }, transactions: [tx({ kind: 'expense', amount: 15_49, currency: 'USD', rate: '510', accountId: 'bank', date: '2026-04-02' })] })
    // 15.49 × 510 = ₡7,899.90
    expect(balance(l.accounts[0], l)).toBe(col(1_000_000) - 789_990)
    const s = summary(l.transactions, monthRange('2026-04'), 'CRC')
    expect(s.expenses).toBe(789_990)
    expect(s.includesConversions).toBe(true)
  })

  it('never combines currencies without an explicit rate', () => {
    const t = netWorth(ledger()).total
    expect(t).toEqual({ CRC: col(1_000_000), USD: 100_00 })
    expect(totalIn(t, 'CRC', '500')).toBe(col(1_050_000))
  })

  it('shows totals in the selected display currency without changing stored amounts', () => {
    const l = ledger({ settings: { ...settings, displayCurrency: 'USD' } })
    const hist = netWorthHistory(l, 1, '2026-01-15')
    expect(hist[0].value).toBe(2_100_00) // ₡1,000,000 / 500 + $100
    expect(netWorth(l).total).toEqual({ CRC: col(1_000_000), USD: 100_00 })
  })

  it('adds income still expected this period from recurring rules', () => {
    const rule = { id: 'r', title: 'Salary', kind: 'income' as const, amount: col(700_000), currency: 'CRC' as const, frequency: 'semimonthly' as const,
      days: [15, 30] as [number, number], startDate: '2026-10-01', endDate: null, generatedCount: 2, active: true, accountId: 'bank',
      destAccountId: null, categoryId: null, createdAt: 0 }
    // posted: Oct 15, Oct 30. On Nov 3, both Nov paydays are still expected.
    const e = expectedIncome([rule], monthRange('2026-11'), 'CRC', '500', '2026-11-03')
    expect(e.total).toBe(col(1_400_000))
    expect(e.dates).toEqual(['2026-11-15', '2026-11-30'])
    // after the 15th is posted, only the 30th remains
    expect(expectedIncome([{ ...rule, generatedCount: 3 }], monthRange('2026-11'), 'CRC', '500', '2026-11-16').total).toBe(col(700_000))
    // past periods expect nothing; expenses and transfers are ignored; converts to USD
    expect(expectedIncome([rule], monthRange('2026-10'), 'CRC', '500', '2026-11-03').total).toBe(0)
    expect(expectedIncome([{ ...rule, kind: 'expense' }], monthRange('2026-11'), 'CRC', '500', '2026-11-03').total).toBe(0)
    expect(expectedIncome([rule], monthRange('2026-11'), 'USD', '500', '2026-11-03').total).toBe(2_800_00)
  })

  it('computes balances as of a date', () => {
    const l = ledger({ transactions: [tx({ kind: 'expense', amount: col(50_000), accountId: 'bank', date: '2026-05-20' })] })
    expect(balance(l.accounts[0], l, '2026-05-01')).toBe(col(1_000_000))
    expect(balance(l.accounts[0], l, '2026-05-31')).toBe(col(950_000))
  })

  it('groups expenses by category', () => {
    const m = expensesByCategory([
      tx({ kind: 'expense', amount: 1000, accountId: 'bank', date: '2026-03-01', categoryId: 'food' }),
      tx({ kind: 'expense', amount: 500, accountId: 'bank', date: '2026-03-02', categoryId: 'food' }),
      tx({ kind: 'expense', amount: 700, accountId: 'bank', date: '2026-03-02' }),
    ], monthRange('2026-03'), 'CRC')
    expect(m.get('food')).toBe(1500)
    expect(m.get('')).toBe(700)
  })
})

describe('investments', () => {
  const etf: Investment = { id: 'etf', name: 'ETF', assetType: 'etf', currency: 'USD', notes: '', createdAt: 0 }
  const contrib = (p: Partial<Contribution> & Pick<Contribution, 'amount' | 'date'>): Contribution => ({
    id: `c${n++}`, investmentId: 'etf', note: '', rate: '500', sourceAccountId: null, ...p,
  })

  it('moves contributions out of the source account (no double counting) and never shows them as gains', () => {
    const l = ledger({ investments: [etf], contributions: [contrib({ amount: 100_00, date: '2026-02-01', sourceAccountId: 'usd' })] })
    expect(balance(l.accounts[2], l)).toBe(0)
    expect(netWorth(l).total.USD).toBe(100_00)
    expect(holding(etf, l).value).toBe(100_00)
    expect(holding(etf, l).gain).toBeNull()

    l.valuations = [{ id: 'v1', investmentId: 'etf', date: '2026-03-01', value: 110_00 }]
    l.contributions.push(contrib({ amount: 50_00, date: '2026-03-10' }))
    const h = holding(etf, l)
    expect(h.netContributions).toBe(150_00)
    expect(h.value).toBe(160_00)
    expect(h.gain).toBe(10_00) // the $50 deposit is not performance
  })

  it('returns withdrawals to the account', () => {
    const fund: Investment = { ...etf, id: 'fund', currency: 'CRC' }
    const l = ledger({
      investments: [fund],
      contributions: [
        contrib({ investmentId: 'fund', amount: col(300_000), date: '2026-02-01', sourceAccountId: 'bank' }),
        contrib({ investmentId: 'fund', amount: -col(100_000), date: '2026-03-01', sourceAccountId: 'bank' }),
      ],
    })
    expect(balance(l.accounts[0], l)).toBe(col(800_000))
    expect(netWorth(l).total.CRC).toBe(col(1_000_000))
  })

  it('converts a USD contribution funded from a CRC account at its recorded rate', () => {
    const l = ledger({ investments: [etf], contributions: [contrib({ amount: 200_00, date: '2026-02-01', sourceAccountId: 'bank', rate: '505' })] })
    expect(balance(l.accounts[0], l)).toBe(col(1_000_000 - 101_000))
  })
})

describe('budgets', () => {
  it('starts fresh each month without rollover', () => {
    const p = budgetProgress(col(100_000), '2026-03', '2026-01', false, (m) => (m === '2026-03' ? col(85_000) : col(20_000)))
    expect(p.carriedOver).toBe(0)
    expect(p.remaining).toBe(col(15_000))
    expect(p.status).toBe('approaching')
  })

  it('carries unused money but never overspending', () => {
    const spent: Record<string, number> = { '2026-01': col(60_000), '2026-02': col(150_000), '2026-03': col(10_000) }
    const feb = budgetProgress(col(100_000), '2026-02', '2026-01', true, (m) => spent[m] ?? 0)
    expect(feb.carriedOver).toBe(col(40_000))
    expect(feb.status).toBe('over')
    const mar = budgetProgress(col(100_000), '2026-03', '2026-01', true, (m) => spent[m] ?? 0)
    expect(mar.carriedOver).toBe(0)
  })
})

describe('goals', () => {
  it('projects completion from the planned monthly contribution', () => {
    const p = projectGoal(col(6_000_000), [{ id: 'g', goalId: 'x', date: '2026-01-02', amount: col(1_000_000), note: '' }], col(300_000), '2027-01-15', '2026-01-15')
    expect(p.remaining).toBe(col(5_000_000))
    expect(p.estimatedCompletion).toBe('2027-06') // 16.7 → 17 months
    expect(p.onTrack).toBe(false)
    expect(p.requiredMonthly).toBe(41_666_667) // ₡416,666.67 over 12 months
  })

  it('has no estimate without a pace', () => {
    const p = projectGoal(1000, [], null, null, '2026-01-01')
    expect(p.estimatedCompletion).toBeNull()
    expect(p.onTrack).toBeNull()
  })
})

describe('recurrence', () => {
  it('anchors monthly schedules to the start day', () => {
    const d = dueOccurrences('2026-01-31', 'monthly', 0, null, '2026-04-30').map((o) => o.date)
    expect(d).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })
  it('catches up from the last posted index', () => {
    expect(dueOccurrences('2026-01-01', 'monthly', 2, null, '2026-05-01').map((o) => o.index)).toEqual([2, 3, 4])
  })
  it('respects end dates', () => {
    expect(dueOccurrences('2026-01-01', 'weekly', 0, '2026-01-20', '2026-03-01')).toHaveLength(3)
  })
  it('pays twice a month on fixed days (quincena), clamping "last day"', () => {
    const d = dueOccurrences('2026-01-10', 'semimonthly', 0, null, '2026-03-31', 400, [15, 31]).map((o) => o.date)
    expect(d).toEqual(['2026-01-15', '2026-01-31', '2026-02-15', '2026-02-28', '2026-03-15', '2026-03-31'])
    // starting after the first payday of the month skips it
    expect(dueOccurrences('2026-01-16', 'semimonthly', 0, null, '2026-02-16', 400, [15, 30]).map((o) => o.date))
      .toEqual(['2026-01-30', '2026-02-15'])
    // older rules without days default to the 15th and last day
    expect(dueOccurrences('2026-04-01', 'semimonthly', 0, null, '2026-04-30').map((o) => o.date)).toEqual(['2026-04-15', '2026-04-30'])
  })
  it('keeps every-2-weeks as a 14-day cycle', () => {
    expect(dueOccurrences('2026-01-02', 'biweekly', 0, null, '2026-02-13').map((o) => o.date))
      .toEqual(['2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13'])
  })
  it('tracks one-off and repeating reminders', () => {
    const base = { id: 'x', title: 'Move money to Schwab', note: '', days: null, doneAt: null, createdAt: 0 }
    expect(reminderDue({ ...base, startDate: '2026-11-15', repeat: null, index: 0 })).toBe('2026-11-15')
    expect(reminderDue({ ...base, startDate: '2026-11-15', repeat: null, index: 0, doneAt: 1 })).toBeNull()
    expect(reminderDue({ ...base, startDate: '2026-01-31', repeat: 'monthly', index: 1 })).toBe('2026-02-28')
    expect(reminderDue({ ...base, startDate: '2026-11-01', repeat: 'semimonthly', days: [15, 31], index: 1 })).toBe('2026-11-30')
  })
  it('keeps a checked-off monthly reminder done until its next date, then renews it', () => {
    const r = { id: 'x', title: 'Move money to Schwab', note: '', startDate: '2026-11-03', repeat: 'monthly' as const, days: null,
      index: 1, lastDone: '2026-11-04', doneAt: null, createdAt: 0 }
    expect(reminderState(r, '2026-11-04')).toEqual({ date: '2026-12-03', done: true })
    expect(reminderState(r, '2026-12-02')).toEqual({ date: '2026-12-03', done: true })
    expect(reminderState(r, '2026-12-03')).toEqual({ date: '2026-12-03', done: false }) // renewed
    // never checked → pending (overdue), one-offs stay done
    expect(reminderState({ ...r, index: 0, lastDone: null }, '2026-11-10')).toEqual({ date: '2026-11-03', done: false })
    expect(reminderState({ ...r, repeat: null, index: 0, doneAt: 1 }, '2026-11-10')).toEqual({ date: null, done: true })
  })
  it('clamps month ends in leap years', () => {
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29')
  })
})

describe('money', () => {
  it('parses many input styles into exact cents', () => {
    expect(parseAmount('12,500')).toBe(1_250_000)
    expect(parseAmount('12.500,50')).toBe(1_250_050)
    expect(parseAmount('1,250,000.75')).toBe(125_000_075)
    expect(parseAmount('₡ 3 500')).toBe(350_000)
    expect(parseAmount('15,49')).toBe(1549)
    expect(parseAmount('0.1')).toBe(10)
    expect(parseAmount('abc')).toBeNull()
  })
  it('converts with exact rounding', () => {
    expect(convert(19_99, 'USD', 'CRC', '505.37')).toBe(1_010_235) // 10,102.3463 → 10,102.35
    expect(convert(col(10_000), 'CRC', 'USD', '505')).toBe(19_80)
    expect(0.1 + 0.2).not.toBe(0.3) // why we use integer cents
    expect(10 + 20).toBe(30)
  })
  it('formats', () => {
    expect(formatMoney(col(1_250_000), 'CRC')).toBe('₡1,250,000')
    expect(formatMoney(-20_50, 'USD')).toBe('−$20.50')
    expect(formatMoney(col(5_000), 'CRC', { signed: true })).toBe('+₡5,000')
  })
  it('adds thousands separators while typing, and parses them back exactly', () => {
    const cases: [string, string][] = [
      ['4500', '4,500'], ['1250000', '1,250,000'], ['1250000.5', '1,250,000.5'], ['12,500', '12,500'],
      ['1,2500', '12,500'], ['12500,5', '12,500.5'], ['1500,', '1,500.'], ['.5', '0.5'], ['007', '7'],
      ['1.234', '1.23'], ['₡ 3 500', '3,500'], ['', ''],
    ]
    for (const [typed, shown] of cases) {
      expect(groupInput(typed)).toBe(shown)
      expect(groupInput(groupInput(typed))).toBe(shown) // stable on every keystroke
    }
    // typing vs deleting
    expect(nextInput('1,234', '1,23')).toBe('123')        // backspace keeps it an integer
    expect(nextInput('1,234', '1,2345')).toBe('12,345')   // typing another digit regroups
    expect(nextInput('1,234', '1,234,')).toBe('1,234.')   // comma key on a Spanish keyboard = decimal
    expect(nextInput('12', '12,5')).toBe('12.5')
    expect(parseAmount('1,250,000.5')).toBe(125_000_050)
    expect(parseAmount('1,500.')).toBe(150_000)
    expect(toInput(125_000_050)).toBe('1,250,000.5')
    expect(parseAmount(toInput(123_456_789))).toBe(123_456_789)
  })
})
