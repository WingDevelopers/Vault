import { db, defaultSettings, newId, DATA_TABLES } from './db'
import { convert } from '../core/money'
import { dueOccurrences } from '../core/finance'
import { today } from '../core/dates'
import type {
  Account, Budget, Category, CategoryKind, Contribution, Goal, GoalContribution, Investment, RecurringRule, Settings, Transaction, Valuation,
} from '../core/types'

// ---------- Settings ----------

export async function getSettings(): Promise<Settings> {
  return { ...defaultSettings(), ...((await db.settings.get('app')) ?? {}) }
}
export async function updateSettings(patch: Partial<Settings>) {
  const s = await getSettings()
  await db.settings.put({ ...s, ...patch })
}

// ---------- Generic save ----------

type WithId = { id: string }
export const withId = <T extends WithId>(o: Omit<T, 'id'> & { id?: string }): T => ({ ...o, id: o.id || newId() }) as T

export const saveAccount = (a: Account) => db.accounts.put(a)
export const saveCategory = (c: Category) => db.categories.put(c)
export const saveTransaction = (t: Transaction) => db.transactions.put(t)
export const saveRule = (r: RecurringRule) => db.rules.put(r)
export const saveBudget = (b: Budget) => db.budgets.put(b)
export const saveInvestment = (i: Investment) => db.investments.put(i)
export const saveContribution = (c: Contribution) => db.contributions.put(c)
export const saveValuation = (v: Valuation) => db.valuations.put(v)
export const saveGoal = (g: Goal) => db.goals.put(g)
export const saveGoalContribution = (c: GoalContribution) => db.goalContributions.put(c)

export const deleteTransaction = (id: string) => db.transactions.delete(id)
export const deleteRule = (id: string) => db.rules.delete(id) // posted transactions are kept
export const deleteBudget = (id: string) => db.budgets.delete(id)
export const deleteContribution = (id: string) => db.contributions.delete(id)
export const deleteValuation = (id: string) => db.valuations.delete(id)
export const deleteGoalContribution = (id: string) => db.goalContributions.delete(id)

// ---------- Deletes with cascades ----------

/** Deletes the account, its transactions (incl. transfers in/out) and rules. Contributions it funded become "not tracked". */
export async function deleteAccount(id: string) {
  await db.transaction('rw', [db.accounts, db.transactions, db.rules, db.contributions], async () => {
    await db.transactions.where('accountId').equals(id).delete()
    await db.transactions.where('destAccountId').equals(id).delete()
    const rules = await db.rules.toArray()
    for (const r of rules) {
      if (r.accountId === id) await db.rules.delete(r.id)
      else if (r.destAccountId === id) await db.rules.update(r.id, { destAccountId: null, active: false })
    }
    await db.contributions.where('sourceAccountId').equals(id).modify({ sourceAccountId: null })
    await db.accounts.delete(id)
  })
}

/** Transactions keep existing but become uncategorized; the category's budget is removed. */
export async function deleteCategory(id: string) {
  await db.transaction('rw', [db.categories, db.transactions, db.rules, db.budgets], async () => {
    await db.transactions.where('categoryId').equals(id).modify({ categoryId: null })
    await db.rules.filter((r) => r.categoryId === id).modify({ categoryId: null })
    await db.budgets.where('categoryId').equals(id).delete()
    await db.categories.delete(id)
  })
}

export async function deleteInvestment(id: string) {
  await db.transaction('rw', [db.investments, db.contributions, db.valuations], async () => {
    await db.contributions.where('investmentId').equals(id).delete()
    await db.valuations.where('investmentId').equals(id).delete()
    await db.investments.delete(id)
  })
}

export async function deleteGoal(id: string) {
  await db.transaction('rw', [db.goals, db.goalContributions], async () => {
    await db.goalContributions.where('goalId').equals(id).delete()
    await db.goals.delete(id)
  })
}

export async function setPrimaryGoal(id: string) {
  await db.transaction('rw', db.goals, async () => {
    await db.goals.toCollection().modify((g) => { g.isPrimary = g.id === id })
  })
}

// ---------- Default categories ----------

const seed = (name: string, icon: string, color: string) => ({ name, icon, color })
export const DEFAULT_EXPENSES = [
  seed('Food', 'utensils', '#FFB86B'), seed('Transportation', 'car', '#38CFFF'), seed('Entertainment', 'clapperboard', '#B794F6'),
  seed('Shopping', 'shopping-bag', '#FF8FB1'), seed('Housing', 'house', '#00A8FF'), seed('Health', 'heart-pulse', '#FF6B78'),
  seed('Education', 'graduation-cap', '#7FD1B9'), seed('Subscriptions', 'repeat', '#6C8CFF'), seed('Other', 'ellipsis', '#8A9BB3'),
]
export const DEFAULT_INCOME = [
  seed('Salary', 'briefcase', '#35D6A0'), seed('Business', 'store', '#38CFFF'), seed('Commissions', 'percent', '#00A8FF'),
  seed('Investment Income', 'trending-up', '#7FD1B9'), seed('Other', 'ellipsis', '#8A9BB3'),
]

export async function seedCategoriesIfNeeded() {
  if ((await db.categories.count()) > 0) return
  const make = (kind: CategoryKind) => (s: ReturnType<typeof seed>, i: number): Category =>
    ({ id: newId(), kind, isDefault: true, sortOrder: i, ...s })
  await db.categories.bulkAdd([...DEFAULT_EXPENSES.map(make('expense')), ...DEFAULT_INCOME.map(make('income'))])
}

export async function ensureSettings() {
  if (!(await db.settings.get('app'))) await db.settings.put(defaultSettings())
}

// ---------- Recurring ----------

export function transactionFromRule(r: RecurringRule, date: string, rate: string, destCurrency?: Transaction['currency']): Transaction {
  const isTransfer = r.kind === 'transfer'
  return {
    id: newId(), kind: r.kind, amount: r.amount, currency: r.currency, date, accountId: r.accountId,
    destAccountId: isTransfer ? r.destAccountId : null,
    destAmount: isTransfer && destCurrency ? convert(r.amount, r.currency, destCurrency, rate) : null,
    categoryId: isTransfer ? null : r.categoryId, rate, note: r.title, ruleId: r.id, createdAt: Date.now(),
  }
}

/** Posts every due occurrence of every active rule, catching up on missed ones. Returns count posted. */
export async function runRecurring(now = today()): Promise<number> {
  return db.transaction('rw', [db.rules, db.transactions, db.accounts, db.settings], async () => {
    const settings = await getSettings()
    const accounts = new Map((await db.accounts.toArray()).map((a) => [a.id, a]))
    let posted = 0
    for (const r of await db.rules.toArray()) {
      if (!r.active || !accounts.has(r.accountId)) continue
      if (r.kind === 'transfer' && (!r.destAccountId || !accounts.has(r.destAccountId))) continue
      const due = dueOccurrences(r.startDate, r.frequency, r.generatedCount, r.endDate, now, 400, r.days ?? null)
      if (!due.length) continue
      const dest = r.destAccountId ? accounts.get(r.destAccountId)?.currency : undefined
      await db.transactions.bulkAdd(due.map((o) => transactionFromRule(r, o.date, settings.crcPerUSD, dest)))
      await db.rules.update(r.id, { generatedCount: due[due.length - 1].index + 1 })
      posted += due.length
    }
    return posted
  })
}

// ---------- Erase ----------

export async function eraseAll() {
  await db.transaction('rw', [db.settings, ...DATA_TABLES.map((t) => db[t])], async () => {
    for (const t of DATA_TABLES) await db[t].clear()
    await db.settings.put(defaultSettings())
  })
  await seedCategoriesIfNeeded()
}
