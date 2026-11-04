import type { Table } from 'dexie'
import { db, DATA_TABLES, defaultSettings, loadAll, newId } from './db'
import { parseAmount, parseRate, toInput } from '../core/money'
import { today } from '../core/dates'
import type { Account, Category, Currency, FinanceData, Transaction, TransactionKind } from '../core/types'

// ============================================================================
// JSON backup (full), optionally encrypted with a password:
// AES-256-GCM with a key from PBKDF2-HMAC-SHA256 (310,000 iterations), via the browser's WebCrypto.
// ============================================================================

export const BACKUP_FORMAT = 'midnight-ledger-backup'
export const ENCRYPTED_FORMAT = 'midnight-ledger-encrypted'

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: 1
  exportedAt: string
  data: FinanceData
}

export interface EncryptedFile {
  format: typeof ENCRYPTED_FORMAT
  version: 1
  kdf: 'PBKDF2-SHA256'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
function b64Large(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export const cryptoAvailable = () => typeof crypto !== 'undefined' && !!crypto.subtle

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptText(plain: string, password: string, iterations = 310_000): Promise<EncryptedFile> {
  if (password.length < 8) throw new Error('Use a password of at least 8 characters.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, iterations)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)))
  return { format: ENCRYPTED_FORMAT, version: 1, kdf: 'PBKDF2-SHA256', iterations, salt: b64(salt), iv: b64(iv), ciphertext: b64Large(ct) }
}

export async function decryptText(file: EncryptedFile, password: string): Promise<string> {
  const key = await deriveKey(password, unb64(file.salt), file.iterations)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.ciphertext))
    return new TextDecoder().decode(plain)
  } catch {
    throw new Error('Wrong password, or the file is damaged.')
  }
}

export async function makeBackup(): Promise<BackupFile> {
  const data = await loadAll()
  // Never export lock secrets.
  data.settings = { ...data.settings, lock: { enabled: false, pinHash: null, pinSalt: null, credentialId: null } }
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), data }
}

export async function exportJSON(password: string | null): Promise<{ name: string; text: string }> {
  const backup = JSON.stringify(await makeBackup())
  const text = password ? JSON.stringify(await encryptText(backup, password)) : backup
  return { name: `walletwing-${today()}${password ? '.encrypted' : ''}.json`, text }
}

/** Parses a backup file. Returns `{ needsPassword: true }` for encrypted files without a password. */
export async function readBackup(text: string, password?: string): Promise<BackupFile | { needsPassword: true }> {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error("This file isn't a WalletWing backup.") }
  const obj = parsed as { format?: string }
  if (obj?.format === ENCRYPTED_FORMAT) {
    if (!password) return { needsPassword: true }
    return readBackup(await decryptText(parsed as EncryptedFile, password))
  }
  if (obj?.format !== BACKUP_FORMAT) throw new Error("This file isn't a WalletWing backup.")
  const b = parsed as BackupFile
  if (b.version > 1) throw new Error('This backup was made by a newer version of the app.')
  return b
}

/** Replaces all data with the backup. Keeps the current app-lock settings. */
export async function restoreBackup(b: BackupFile) {
  await db.transaction('rw', [db.settings, ...DATA_TABLES.map((t) => db[t])], async () => {
    const current = (await db.settings.get('app')) ?? defaultSettings()
    for (const t of DATA_TABLES) await db[t].clear()
    for (const t of DATA_TABLES) {
      const rows = (b.data[t] ?? []) as never[]
      if (rows.length) await (db[t] as unknown as Table<unknown, string>).bulkAdd(rows)
    }
    await db.settings.put({ ...defaultSettings(), ...b.data.settings, onboarded: true, lock: current.lock })
  })
}

// ============================================================================
// CSV — transactions only, for spreadsheets. Not encrypted.
// ============================================================================

const CSV_HEADER = ['date', 'type', 'amount', 'currency', 'account', 'to_account', 'to_amount', 'category', 'note', 'rate_crc_per_usd']

function csvCell(v: string) {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function transactionsToCSV(data: Pick<FinanceData, 'transactions' | 'accounts' | 'categories'>): string {
  const acc = new Map(data.accounts.map((a) => [a.id, a]))
  const cat = new Map(data.categories.map((c) => [c.id, c]))
  const rows = [...data.transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt)).map((t) => [
    t.date, t.kind, toInput(t.amount), t.currency, acc.get(t.accountId)?.name ?? '', t.destAccountId ? acc.get(t.destAccountId)?.name ?? '' : '',
    t.destAmount != null ? toInput(t.destAmount) : '', t.categoryId ? cat.get(t.categoryId)?.name ?? '' : '', t.note, t.rate,
  ])
  return [CSV_HEADER, ...rows].map((r) => r.map((v) => csvCell(String(v))).join(',')).join('\r\n') + '\r\n'
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}

export interface CSVImportPlan {
  transactions: Transaction[]
  newAccounts: Account[]
  newCategories: Category[]
  errors: string[]
}

/**
 * Builds (but doesn't save) an import from CSV in the export format.
 * Accounts and categories are matched by name; missing ones are created.
 */
export function planCSVImport(text: string, existing: Pick<FinanceData, 'accounts' | 'categories' | 'settings'>): CSVImportPlan {
  const rows = parseCSV(text)
  const errors: string[] = []
  if (!rows.length) return { transactions: [], newAccounts: [], newCategories: [], errors: ['The file is empty.'] }
  const header = rows[0].map((h) => h.trim().toLowerCase())
  const col = (name: string) => header.indexOf(name)
  for (const required of ['date', 'type', 'amount', 'account']) {
    if (col(required) < 0) errors.push(`Missing column "${required}".`)
  }
  if (errors.length) return { transactions: [], newAccounts: [], newCategories: [], errors }

  const accounts = new Map(existing.accounts.map((a) => [a.name.toLowerCase(), a]))
  const categories = new Map(existing.categories.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c]))
  const newAccounts: Account[] = [], newCategories: Category[] = [], transactions: Transaction[] = []
  const get = (r: string[], name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '')

  const accountFor = (name: string, currency: Currency) => {
    const key = name.toLowerCase()
    let a = accounts.get(key)
    if (!a) {
      a = { id: newId(), name, kind: 'bank', currency, openingBalance: 0, openingDate: '2000-01-01', archived: false, sortOrder: existing.accounts.length + newAccounts.length, createdAt: Date.now() }
      accounts.set(key, a); newAccounts.push(a)
    }
    return a
  }

  rows.slice(1).forEach((r, i) => {
    const line = i + 2
    const date = get(r, 'date')
    const kind = get(r, 'type').toLowerCase() as TransactionKind
    const amount = parseAmount(get(r, 'amount'))
    const currency = (get(r, 'currency').toUpperCase() || existing.settings.primaryCurrency) as Currency
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errors.push(`Line ${line}: date must be YYYY-MM-DD.`)
    if (!['expense', 'income', 'transfer'].includes(kind)) return errors.push(`Line ${line}: type must be expense, income or transfer.`)
    if (amount === null || amount <= 0) return errors.push(`Line ${line}: amount must be a positive number.`)
    if (currency !== 'CRC' && currency !== 'USD') return errors.push(`Line ${line}: currency must be CRC or USD.`)
    if (!get(r, 'account')) return errors.push(`Line ${line}: account is required.`)
    const account = accountFor(get(r, 'account'), currency)
    let destAccountId: string | null = null, destAmount: number | null = null, categoryId: string | null = null
    if (kind === 'transfer') {
      if (!get(r, 'to_account')) return errors.push(`Line ${line}: transfers need to_account.`)
      destAccountId = accountFor(get(r, 'to_account'), currency).id
      destAmount = parseAmount(get(r, 'to_amount'))
    } else if (get(r, 'category')) {
      const name = get(r, 'category')
      const key = `${kind}:${name.toLowerCase()}`
      let c = categories.get(key)
      if (!c) {
        c = { id: newId(), name, kind, icon: 'tag', color: '#8A9BB3', isDefault: false, sortOrder: 100 + newCategories.length }
        categories.set(key, c); newCategories.push(c)
      }
      categoryId = c.id
    }
    transactions.push({
      id: newId(), kind, amount, currency, date, accountId: account.id, destAccountId, destAmount, categoryId,
      rate: parseRate(get(r, 'rate_crc_per_usd')) ?? existing.settings.crcPerUSD, note: get(r, 'note'), ruleId: null, createdAt: Date.now() + i,
    })
  })
  return { transactions, newAccounts, newCategories, errors }
}

export async function applyCSVImport(p: CSVImportPlan) {
  await db.transaction('rw', [db.accounts, db.categories, db.transactions], async () => {
    if (p.newAccounts.length) await db.accounts.bulkAdd(p.newAccounts)
    if (p.newCategories.length) await db.categories.bulkAdd(p.newCategories)
    await db.transactions.bulkAdd(p.transactions)
  })
}

// ============================================================================
// Saving a file on iPhone: share sheet ("Save to Files") when available, download otherwise.
// ============================================================================

export async function saveFile(name: string, text: string, type: string) {
  const blob = new Blob([text], { type })
  const file = new File([blob], name, { type })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name })
      return
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

