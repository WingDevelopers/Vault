import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LedgerDB, loadAll, useDatabase } from './db'
import { deleteAccount, deleteCategory, eraseAll, runRecurring, seedCategoriesIfNeeded, ensureSettings, saveAccount, saveRule } from './repo'
import { applyCSVImport, exportJSON, planCSVImport, readBackup, restoreBackup, transactionsToCSV } from './backup'
import { loadDemoData } from './demo'
import { balance, netWorth } from '../core/finance'

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

  it('round-trips an encrypted JSON backup exactly', async () => {
    await loadDemoData('2026-06-15')
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
