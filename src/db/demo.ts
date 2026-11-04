import { db, newId } from './db'
import { getSettings, seedCategoriesIfNeeded, updateSettings } from './repo'
import { addDays, addMonthsToKey, currentMonth, daysInMonth, monthStart, today } from '../core/dates'
import { dueOccurrences } from '../core/finance'
import type { Account, Category, Contribution, Currency, GoalContribution, Transaction, TransactionKind, Valuation } from '../core/types'

/** Clearly labeled sample data. Only loaded when the user asks for it. */
export async function loadDemoData(now = today()) {
  await seedCategoriesIfNeeded()
  const categories = await db.categories.toArray()
  const cat = (name: string, kind: Category['kind']) => categories.find((c) => c.name === name && c.kind === kind)?.id ?? null
  const startMonth = addMonthsToKey(currentMonth(), -6)
  const start = monthStart(startMonth)
  const col = (n: number) => Math.round(n * 100)

  const mk = (name: string, kind: Account['kind'], currency: Currency, opening: number, sortOrder: number): Account =>
    ({ id: newId(), name, kind, currency, openingBalance: col(opening), openingDate: start, archived: false, sortOrder, createdAt: Date.now() })
  const bank = mk('BAC Colones', 'bank', 'CRC', 850_000, 0)
  const cash = mk('Wallet', 'cash', 'CRC', 40_000, 1)
  const savings = mk('Dollar Savings', 'savings', 'USD', 3_200, 2)
  const brokerage = mk('Brokerage Cash', 'investment', 'USD', 1_500, 3)

  let seed = 42
  const jitter = (base: number, spread: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return Math.round(base * (1 + (((seed % (spread * 2 + 1)) - spread) / 100)))
  }

  const txs: Transaction[] = []
  const salaryRuleId = newId(), streamingRuleId = newId()
  for (let m = 0; m <= 6; m++) {
    const month = addMonthsToKey(startMonth, m)
    const [y, mm] = month.split('-').map(Number)
    const day = (d: number) => `${month}-${String(Math.min(d, daysInMonth(y, mm))).padStart(2, '0')}`
    const add = (amount: number, currency: Currency, kind: TransactionKind, category: string | null, note: string, account: Account, d: number,
      extra: Partial<Transaction> = {}) => {
      const date = day(d)
      if (date > now) return
      txs.push({
        id: newId(), kind, amount: col(amount), currency, date, accountId: account.id, destAccountId: null, destAmount: null,
        categoryId: category ? cat(category, kind === 'income' ? 'income' : 'expense') : null, rate: '505', note, ruleId: null,
        createdAt: Date.now() + txs.length, ...extra,
      })
    }
    add(1_450_000, 'CRC', 'income', 'Salary', 'Salary', bank, 1, { ruleId: salaryRuleId })
    add(380_000, 'CRC', 'expense', 'Housing', 'Rent', bank, 3)
    add(jitter(62_000, 20), 'CRC', 'expense', 'Food', 'Supermarket', bank, 5)
    add(jitter(18_500, 30), 'CRC', 'expense', 'Food', 'Lunch', cash, 8)
    add(jitter(45_000, 25), 'CRC', 'expense', 'Transportation', 'Fuel', bank, 10)
    add(15.49, 'USD', 'expense', 'Subscriptions', 'Streaming', bank, 12, { ruleId: streamingRuleId })
    add(jitter(70_000, 30), 'CRC', 'expense', 'Food', 'Supermarket', bank, 17)
    add(jitter(32_000, 50), 'CRC', 'expense', 'Entertainment', 'Dinner & movie', bank, 20)
    add(jitter(28_000, 60), 'CRC', 'expense', 'Health', 'Pharmacy', bank, 22)
    add(jitter(55_000, 70), 'CRC', 'expense', 'Shopping', 'Clothes', bank, 25)
    add(60_000, 'CRC', 'transfer', null, 'ATM withdrawal', bank, 14, { destAccountId: cash.id, destAmount: col(60_000) })
    add(202_000, 'CRC', 'transfer', null, 'To dollar savings', bank, 2, { destAccountId: savings.id, destAmount: col(400) })
    if (m % 3 === 1) add(120_000, 'CRC', 'income', 'Commissions', 'Quarterly commission', bank, 15)
  }

  const salaryStart = start
  const streamingStart = addDays(start, 11)
  const rules = [
    { id: salaryRuleId, title: 'Salary', kind: 'income' as const, amount: col(1_450_000), currency: 'CRC' as const, frequency: 'monthly' as const,
      startDate: salaryStart, endDate: null, generatedCount: dueOccurrences(salaryStart, 'monthly', 0, null, now).length, active: true,
      accountId: bank.id, destAccountId: null, categoryId: cat('Salary', 'income'), createdAt: Date.now() },
    { id: streamingRuleId, title: 'Streaming', kind: 'expense' as const, amount: 15_49, currency: 'USD' as const, frequency: 'monthly' as const,
      startDate: streamingStart, endDate: null, generatedCount: dueOccurrences(streamingStart, 'monthly', 0, null, now).length, active: true,
      accountId: bank.id, destAccountId: null, categoryId: cat('Subscriptions', 'expense'), createdAt: Date.now() },
  ]

  const etfId = newId(), bondId = newId()
  const contributions: Contribution[] = []
  const valuations: Valuation[] = []
  let etfValue = 0
  for (let m = 0; m <= 6; m++) {
    const d = `${addMonthsToKey(startMonth, m)}-04`
    if (d > now) continue
    contributions.push({ id: newId(), investmentId: etfId, date: d, amount: 200_00, note: '', rate: '505', sourceAccountId: brokerage.id })
    etfValue = (etfValue + 200) * (1 + (m % 3 === 0 ? -1 : 2) / 100)
    const vd = addDays(d, 20)
    if (m % 2 === 0 && vd <= now) valuations.push({ id: newId(), investmentId: etfId, date: vd, value: Math.round(etfValue * 100) })
  }
  contributions.push({ id: newId(), investmentId: bondId, date: addDays(start, 3), amount: col(500_000), note: 'Initial', rate: '505', sourceAccountId: bank.id })
  valuations.push({ id: newId(), investmentId: bondId, date: `${addMonthsToKey(startMonth, 5)}-28`, value: col(517_400) })

  const nestId = newId(), bufferId = newId()
  const goalContribs: GoalContribution[] = []
  for (let m = 0; m <= 6; m++) {
    const d = `${addMonthsToKey(startMonth, m)}-02`
    if (d <= now) goalContribs.push({ id: newId(), goalId: nestId, date: d, amount: col(180_000), note: '' })
  }
  goalContribs.push({ id: newId(), goalId: bufferId, date: start, amount: 2_400_00, note: 'Starting balance' })

  const [ty, tm, td] = now.split('-').map(Number)
  await db.transaction('rw', [db.accounts, db.transactions, db.rules, db.budgets, db.investments, db.contributions, db.valuations, db.goals, db.goalContributions], async () => {
    await db.accounts.bulkAdd([bank, cash, savings, brokerage])
    await db.transactions.bulkAdd(txs)
    await db.rules.bulkAdd(rules)
    const food = cat('Food', 'expense'), ent = cat('Entertainment', 'expense')
    if (food) await db.budgets.add({ id: newId(), categoryId: food, amount: col(180_000), currency: 'CRC', rollover: false, startMonth })
    if (ent) await db.budgets.add({ id: newId(), categoryId: ent, amount: col(40_000), currency: 'CRC', rollover: false, startMonth })
    await db.investments.bulkAdd([
      { id: etfId, name: 'Global Equity ETF', assetType: 'etf', currency: 'USD', notes: 'Sample holding', createdAt: Date.now() },
      { id: bondId, name: 'Colón Bond Fund', assetType: 'bond', currency: 'CRC', notes: '', createdAt: Date.now() + 1 },
    ])
    await db.contributions.bulkAdd(contributions)
    await db.valuations.bulkAdd(valuations)
    await db.goals.bulkAdd([
      { id: nestId, name: 'The Nest', purpose: 'Future apartment and moving expenses', icon: 'house', currency: 'CRC', target: col(6_000_000),
        targetDate: `${ty + 2}-${String(tm).padStart(2, '0')}-${String(Math.min(td, 28)).padStart(2, '0')}`, monthly: col(180_000), isPrimary: true, createdAt: Date.now() },
      { id: bufferId, name: 'Emergency Fund', purpose: 'Six months of expenses', icon: 'shield', currency: 'USD', target: 6_000_00,
        targetDate: null, monthly: null, isPrimary: false, createdAt: Date.now() + 1 },
    ])
    await db.goalContributions.bulkAdd(goalContribs)
  })
  const s = await getSettings()
  await updateSettings({ primaryCurrency: 'CRC', monthlyAllowance: col(650_000), allowanceCurrency: 'CRC', onboarded: true, isDemo: true, lock: s.lock })
}
