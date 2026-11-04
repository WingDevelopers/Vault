import Dexie, { type Table } from 'dexie'
import type {
  Account, Budget, Category, Contribution, FinanceData, Goal, GoalContribution, Investment, RecurringRule, Reminder, Settings, Transaction, Valuation,
} from '../core/types'
import { today } from '../core/dates'

/** Local IndexedDB database. Nothing here is ever sent anywhere. */
export class LedgerDB extends Dexie {
  settings!: Table<Settings, string>
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>
  rules!: Table<RecurringRule, string>
  budgets!: Table<Budget, string>
  investments!: Table<Investment, string>
  contributions!: Table<Contribution, string>
  valuations!: Table<Valuation, string>
  goals!: Table<Goal, string>
  goalContributions!: Table<GoalContribution, string>
  reminders!: Table<Reminder, string>

  constructor(name = 'midnight-ledger') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      accounts: 'id, sortOrder',
      categories: 'id, kind, sortOrder',
      transactions: 'id, date, accountId, destAccountId, categoryId, ruleId',
      rules: 'id',
      budgets: 'id, categoryId',
      investments: 'id',
      contributions: 'id, investmentId, sourceAccountId, date',
      valuations: 'id, investmentId, date',
      goals: 'id',
      goalContributions: 'id, goalId',
    })
    this.version(2).stores({ reminders: 'id' })
  }
}

export let db = new LedgerDB()
/** For tests. */
export function useDatabase(instance: LedgerDB) { db = instance }

export const DATA_TABLES = [
  'accounts', 'categories', 'transactions', 'rules', 'budgets', 'investments', 'contributions', 'valuations', 'goals', 'goalContributions', 'reminders',
] as const
export type DataTable = (typeof DATA_TABLES)[number]

export function defaultSettings(): Settings {
  return {
    id: 'app', primaryCurrency: 'CRC', displayCurrency: null, allowanceCurrency: null, crcPerUSD: '505', rateUpdatedAt: today(), autoRate: true, rateSource: null, rateCheckedAt: null, monthlyAllowance: null, onboarded: false,
    hideAmounts: false, isDemo: false, lastAccountId: null, lock: { enabled: false, pinHash: null, pinSalt: null, credentialId: null },
  }
}

export async function loadAll(): Promise<FinanceData> {
  return db.transaction('r', [db.settings, ...DATA_TABLES.map((t) => db[t])], async () => {
    const [settings, ...rest] = await Promise.all([db.settings.get('app'), ...DATA_TABLES.map((t) => db[t].toArray())])
    const data = Object.fromEntries(DATA_TABLES.map((t, i) => [t, rest[i]])) as Omit<FinanceData, 'settings'>
    return { settings: { ...defaultSettings(), ...(settings as Settings | undefined) }, ...data }
  })
}

/** Random id that works in insecure contexts too (crypto.randomUUID needs HTTPS). */
export function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
