import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LedgerDB, loadAll, useDatabase } from './db'
import { completeReminder, deleteAccount, deleteCategory, eraseAll, runRecurring, saveReminder, seedCategoriesIfNeeded, ensureSettings, saveAccount, saveRule, uncompleteReminder, undoCompleteReminder } from './repo'
import { applyCSVImport, exportJSON, planCSVImport, readBackup, restoreBackup, transactionsToCSV } from './backup'
import { loadDemoData } from './demo'
import { balance, netWorth, reminderDue } from '../core/finance'

let i = 0
beforeEach(async () => {
  useDatabase(new LedgerDB(`test-${i++}`))
  await ensureSettings()
  await seedCategoriesIfNeeded()
})

describe('data layer', () => {
  it('posts recurring occurrences and catches up', async () => {
    await saveAccount({ id: 'a', name: 'Bank', kind: 'bank', currency: 'CRC', openingBalance: 0, openingDate: '2026-01-01', archived: false, sortOrder: 0, createdAt: 0 })
    await saveRule({ id: 'r', title: 'Salary', kind: 'income', amount: 100_00, currency: 'CRC', frequency: 'monthly', startDate: '2026-01-31',
      endDate: null, generatedCount: 0, active: true, accountId: 'a', destAccountId: null, categoryId: null, createdAt: 0 })
    expect(await runRecurring('2026-03-31')).toBe(3)
    expect(await runRecurring('2026-03-31')).toBe(0) // idempotent
    const d = await loadAll()
    expect(d.transactions.map((t) => t.date).sort()).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(d.rules[0].generatedCount).toBe(3)
  })

  it('posts twice-a-month salary on both paydays', async () => {
    await saveAccount({ id: 'a', name: 'Bank', kind: 'bank', currency: 'CRC', openingBalance: 0, openingDate: '2026-01-01', archived: false, sortOrder: 0, createdAt: 0 })
    await saveRule({ id: 'q', title: 'Salary', kind: 'income', amount: 700_000_00, currency: 'CRC', frequency: 'semimonthly', days: [15, 31],
      startDate: '2026-01-01', endDate: null, generatedCount: 0, active: true, accountId: 'a', destAccountId: null, categoryId: null, createdAt: 0 })
    expect(await runRecurring('2026-02-20')).toBe(3)
    const d = await loadAll()
    expect(d.transactions.map((t) => t.date).sort()).toEqual(['2026-01-15', '2026-01-31', '2026-02-15'])
    expect(await runRecurring('2026-02-28')).toBe(1)
  })

  it('cascades account and category deletes', async () => {
    await loadDemoData('2026-06-15')
    let d = await loadAll()
    const food = d.categories.find((c) => c.name === 'Food')!
    await deleteCategory(food.id)
    d = await loadAll()
    expect(d.transactions.some((t) => t.categoryId === food.id)).toBe(false)
    expect(d.budgets.some((b) => b.categoryId === food.id)).toBe(false)

    const wallet = d.accounts.find((a) => a.name === 'Wallet')!
    await deleteAccount(wallet.id)
    d = await loadAll()
    expect(d.transactions.some((t) => t.accountId === wallet.id || t.destAccountId === wallet.id)).toBe(false)
  })

  it('completes repeating reminders by moving to the next date', async () => {
    const r = { id: 'r1', title: 'Invest', note: '', startDate: '2026-11-15', repeat: 'monthly' as const, days: null, index: 0, doneAt: null, createdAt: 0 }
    await saveReminder(r)
    await completeReminder(r)
    let d = await loadAll()
    expect(reminderDue(d.reminders[0])).toBe('2026-12-15')
    expect(d.reminders[0].lastDone).toBeTruthy()
    await undoCompleteReminder(r)
    d = await loadAll()
    expect(reminderDue(d.reminders[0])).toBe('2026-11-15')
    expect(d.reminders[0].lastDone).toBeNull()
    // checking and then un-checking the circle returns it to pending
    await completeReminder(d.reminders[0])
    d = await loadAll()
    await uncompleteReminder(d.reminders[0])
    d = await loadAll()
    expect(reminderDue(d.reminders[0])).toBe('2026-11-15')
    expect(d.reminders[0].lastDone).toBeNull()
  })

  it('round-trips an encrypted JSON backup exactly', async () => {
    await loadDemoData('2026-06-15')
    await saveReminder({ id: 'rm', title: 'Move money to Schwab', note: '₡700,000', startDate: '2026-06-30', repeat: 'monthly', days: null, index: 2, doneAt: null, createdAt: 1 })
    const before = await loadAll()
    const { text } = await exportJSON('correct horse battery')
    expect(text).not.toContain('Salary')
    expect(await readBackup(text)).toEqual({ needsPassword: true })
    await expect(readBackup(text, 'wrong password!')).rejects.toThrow(/Wrong password/)

    await eraseAll()
    expect((await loadAll()).transactions).toHaveLength(0)
    const backup = await readBackup(text, 'correct horse battery')
    if ('needsPassword' in backup) throw new Error('unexpected')
    await restoreBackup(backup)
    const after = await loadAll()
    expect(after.transactions.length).toBe(before.transactions.length)
    expect(netWorth(after).total).toEqual(netWorth(before).total)
    expect(after.reminders).toEqual(before.reminders)
    const bank = after.accounts.find((a) => a.name === 'BAC Colones')!
    expect(balance(bank, after)).toBe(balance(before.accounts.find((a) => a.name === 'BAC Colones')!, before))
  })

  it('exports and re-imports transactions as CSV', async () => {
    await loadDemoData('2026-06-15')
    const before = await loadAll()
    const csv = transactionsToCSV(before)
    expect(csv.split('\r\n')[0]).toBe('date,type,amount,currency,account,to_account,to_amount,category,note,rate_crc_per_usd')

    await eraseAll()
    const fresh = await loadAll()
    const plan = planCSVImport(csv, fresh)
    expect(plan.errors).toEqual([])
    expect(plan.transactions).toHaveLength(before.transactions.length)
    expect(plan.newAccounts.map((a) => a.name).sort()).toEqual(['BAC Colones', 'Dollar Savings', 'Wallet'])
    await applyCSVImport(plan)
    const after = await loadAll()
    const sum = (d: typeof after) => d.transactions.reduce((s, t) => s + (t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : 0), 0)
    expect(sum(after)).toBe(sum(before))
  })

  it('reports CSV problems by line', () => {
    const plan = planCSVImport('date,type,amount,account\n2026-01-01,expense,abc,Bank\n01/02/2026,income,5,Bank\n', {
      accounts: [], categories: [], settings: { primaryCurrency: 'CRC', crcPerUSD: '505' } as never,
    })
    expect(plan.errors).toEqual(['Line 2: amount must be a positive number.', 'Line 3: date must be YYYY-MM-DD.'])
  })
})
