// Domain entities. These are stored as-is in IndexedDB.
// Money is always an integer number of minor units ("cents" / céntimos) to keep arithmetic exact.

export type Currency = 'CRC' | 'USD'
export const CURRENCIES: Currency[] = ['CRC', 'USD']

/** Integer minor units (1 = ₡0.01 or $0.01). Never a float. */
export type Cents = number

/** Calendar date without time zone: "YYYY-MM-DD". */
export type ISODate = string
/** Calendar month: "YYYY-MM". */
export type MonthKey = string

export type TransactionKind = 'expense' | 'income' | 'transfer'
export type CategoryKind = 'expense' | 'income'
export type AccountKind = 'bank' | 'cash' | 'savings' | 'investment'
export type AssetType = 'stock' | 'etf' | 'fund' | 'bond' | 'cash' | 'other'
export type Frequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'yearly'
/** Twice-a-month paydays: [first (1–15), second (16–30, or 31 = last day of the month)]. */
export type PayDays = [number, number]
export const DEFAULT_PAYDAYS: PayDays = [15, 31]

export interface Settings {
  id: 'app'
  primaryCurrency: Currency
  /** Colones per 1 USD, decimal string, e.g. "505.25". */
  crcPerUSD: string
  rateUpdatedAt: ISODate
  monthlyAllowance: Cents | null
  onboarded: boolean
  hideAmounts: boolean
  isDemo: boolean
  lastAccountId: string | null
  lock: {
    enabled: boolean
    pinHash: string | null
    pinSalt: string | null
    /** WebAuthn credential id (base64url) for Face ID / Touch ID unlock. */
    credentialId: string | null
  }
}

export interface Account {
  id: string
  name: string
  kind: AccountKind
  currency: Currency
  openingBalance: Cents
  openingDate: ISODate
  archived: boolean
  sortOrder: number
  createdAt: number
}

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  icon: string
  color: string
  isDefault: boolean
  sortOrder: number
}

export interface Transaction {
  id: string
  kind: TransactionKind
  /** Always positive, in `currency`. */
  amount: Cents
  currency: Currency
  date: ISODate
  accountId: string
  /** Transfers only. */
  destAccountId: string | null
  /** Transfers only: amount received, in the destination account's currency. */
  destAmount: Cents | null
  categoryId: string | null
  /** ₡ per $ recorded with the transaction. Used for every conversion involving it. */
  rate: string
  note: string
  ruleId: string | null
  createdAt: number
}

export interface RecurringRule {
  id: string
  title: string
  kind: TransactionKind
  amount: Cents
  currency: Currency
  frequency: Frequency
  /** Only for 'semimonthly'. Missing on older rules → [15, last day]. */
  days?: PayDays | null
  startDate: ISODate
  endDate: ISODate | null
  /** Occurrences already posted. Occurrence n is computed from startDate (no drift). */
  generatedCount: number
  active: boolean
  accountId: string
  destAccountId: string | null
  categoryId: string | null
  createdAt: number
}

export interface Budget {
  id: string
  categoryId: string
  amount: Cents
  currency: Currency
  rollover: boolean
  startMonth: MonthKey
}

export interface Investment {
  id: string
  name: string
  assetType: AssetType
  currency: Currency
  notes: string
  createdAt: number
}

export interface Contribution {
  id: string
  investmentId: string
  date: ISODate
  /** + contribution / − withdrawal, in the investment's currency. */
  amount: Cents
  note: string
  rate: string
  /** Account the money came from (or returns to). Optional. */
  sourceAccountId: string | null
}

export interface Valuation {
  id: string
  investmentId: string
  /** Market value at the END of this day (includes contributions dated on/before it). */
  date: ISODate
  value: Cents
}

export interface Goal {
  id: string
  name: string
  purpose: string
  icon: string
  currency: Currency
  target: Cents
  targetDate: ISODate | null
  monthly: Cents | null
  isPrimary: boolean
  createdAt: number
}

/** Earmarked money. A label only — never moves money or changes net worth. */
export interface GoalContribution {
  id: string
  goalId: string
  date: ISODate
  amount: Cents
  note: string
}

export interface FinanceData {
  settings: Settings
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  rules: RecurringRule[]
  budgets: Budget[]
  investments: Investment[]
  contributions: Contribution[]
  valuations: Valuation[]
  goals: Goal[]
  goalContributions: GoalContribution[]
}

export const ACCOUNT_KINDS: { id: AccountKind; title: string }[] = [
  { id: 'bank', title: 'Bank' },
  { id: 'cash', title: 'Cash' },
  { id: 'savings', title: 'Savings' },
  { id: 'investment', title: 'Investment (cash)' },
]

export const ASSET_TYPES: { id: AssetType; title: string }[] = [
  { id: 'stock', title: 'Stock' },
  { id: 'etf', title: 'ETF' },
  { id: 'fund', title: 'Fund' },
  { id: 'bond', title: 'Bond' },
  { id: 'cash', title: 'Cash equivalent' },
  { id: 'other', title: 'Other' },
]

export const FREQUENCIES: { id: Frequency; title: string }[] = [
  { id: 'weekly', title: 'Weekly' },
  { id: 'biweekly', title: 'Every 2 weeks' },
  { id: 'semimonthly', title: 'Twice a month' },
  { id: 'monthly', title: 'Monthly' },
  { id: 'yearly', title: 'Yearly' },
]

export const isAvailableCash = (k: AccountKind) => k === 'bank' || k === 'cash'
