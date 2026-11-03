import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Ellipsis, Search, SlidersHorizontal, X } from 'lucide-react'
import { addMonthsToKey, currentMonth, fmtDayHeader, fmtMonth, inRange, monthRange } from '../core/dates'
import { expensesByCategory, summary } from '../core/finance'
import { toInput } from '../core/money'
import type { TransactionKind } from '../core/types'
import { useApp } from '../state'
import { Amount, EmptyState, Footnote, LargeTitle, NavBar, Sheet } from '../ui/components'
import { BarList } from '../ui/charts'
import { TransactionEditor, TransactionRow } from './TransactionEditor'

export function Activity({ pushed = false }: { pushed?: boolean }) {
  const { data, openSheet } = useApp()
  const [month, setMonth] = useState(currentMonth())
  const [allTime, setAllTime] = useState(false)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<TransactionKind | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const hasFilters = !!(kind || categoryId || accountId)
  const range = monthRange(month)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const cat = new Map(data.categories.map((c) => [c.id, c.name]))
    const acc = new Map(data.accounts.map((a) => [a.id, a.name]))
    return data.transactions.filter((t) => {
      if (!allTime && !inRange(t.date, range)) return false
      if (kind && t.kind !== kind) return false
      if (categoryId && t.categoryId !== categoryId) return false
      if (accountId && t.accountId !== accountId && t.destAccountId !== accountId) return false
      if (q) {
        const hay = [t.note, cat.get(t.categoryId ?? ''), acc.get(t.accountId), acc.get(t.destAccountId ?? ''), toInput(t.amount), t.kind].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    }).sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
  }, [data, allTime, range.start, kind, categoryId, accountId, query]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const m = new Map<string, typeof filtered>()
    for (const t of filtered) m.set(t.date, [...(m.get(t.date) ?? []), t])
    return [...m.entries()]
  }, [filtered])

  const filterSheet = () => openSheet(
    <FilterSheet kind={kind} categoryId={categoryId} accountId={accountId}
      onApply={(k, c, a) => { setKind(k); setCategoryId(c); setAccountId(a) }} />,
  )

  const menu = (
    <button className="icon-btn" aria-label="Manage" onClick={() => openSheet(<ManageMenu />)}><Ellipsis size={18} /></button>
  )

  return (
    <div className={`screen ${pushed ? 'with-nav slide-in' : 'fade-in'}`}>
      {pushed ? <NavBar title="Activity" right={menu} /> : (
        <LargeTitle title="Activity">
          <button className="icon-btn" aria-label="Filter" onClick={filterSheet} style={hasFilters ? { background: 'var(--electric)', color: 'var(--midnight)' } : undefined}><SlidersHorizontal size={17} /></button>
          {menu}
        </LargeTitle>
      )}
      <div className="stack" style={{ marginTop: 12 }}>
        <div className="row" style={{ background: 'rgba(118,118,128,0.24)', borderRadius: 10, padding: '0 10px' }}>
          <Search size={16} className="muted" />
          <input className="field" style={{ textAlign: 'left' }} placeholder="Search notes, categories, accounts" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
          {query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={16} className="muted" /></button>}
          {pushed && <button aria-label="Filter" onClick={filterSheet}><SlidersHorizontal size={16} className={hasFilters ? 'accent' : 'muted'} /></button>}
        </div>

        <div className="row-between">
          <button className="icon-btn plain" aria-label="Previous month" disabled={allTime} onClick={() => setMonth(addMonthsToKey(month, -1))}><ChevronLeft size={22} /></button>
          <button className="strong" style={{ fontSize: 17 }} onClick={() => setAllTime(!allTime)} aria-label="Toggle all time">
            {allTime ? 'All time' : fmtMonth(month)}
          </button>
          <button className="icon-btn plain" aria-label="Next month" disabled={allTime || month >= currentMonth()} onClick={() => setMonth(addMonthsToKey(month, 1))}><ChevronRight size={22} /></button>
        </div>

        {!allTime && <MonthlyBreakdown month={month} />}

        {hasFilters && (
          <button className="banner" style={{ color: 'var(--electric)', background: 'rgba(0,168,255,0.1)' }} onClick={() => { setKind(''); setCategoryId(''); setAccountId('') }}>
            <SlidersHorizontal size={14} />Filters on — tap to clear
          </button>
        )}

        {!filtered.length && (
          <div className="card"><EmptyState icon={query ? 'sparkles' : 'tag'} title={query || hasFilters ? 'No matches' : 'Nothing recorded here'}
            message={query || hasFilters ? 'Try a different search or clear filters.' : 'Tap + to add income, an expense or a transfer.'} /></div>
        )}

        {groups.map(([day, items]) => (
          <div key={day} className="stack-s" style={{ gap: 6 }}>
            <div className="caps">{fmtDayHeader(day)}</div>
            <div className="card list">
              {items.map((t) => <TransactionRow key={t.id} tx={t} showDate={false} onClick={() => openSheet(<TransactionEditor tx={t} />)} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthlyBreakdown({ month }: { month: string }) {
  const { data } = useApp()
  const cur = data.settings.primaryCurrency
  const range = monthRange(month)
  const s = summary(data.transactions, range, cur)
  const rows = [...expensesByCategory(data.transactions, range, cur).entries()]
    .map(([id, value]) => {
      const c = data.categories.find((x) => x.id === id)
      return { label: c?.name ?? 'Uncategorized', value, color: c?.color ?? '#8A9BB3' }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
  return (
    <div className="card stack-s">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div><div className="small muted">Spent</div><Amount className="strong" style={{ fontSize: 24 }} value={s.expenses} currency={cur} /></div>
        <div style={{ textAlign: 'right' }}><div className="small muted">Income</div><Amount className="strong" style={{ fontSize: 17 }} value={s.income} currency={cur} colored /></div>
      </div>
      {rows.length ? (data.settings.hideAmounts ? null : <BarList rows={rows} currency={cur} />) : <div className="small muted">No expenses this month.</div>}
      {s.includesConversions && <Footnote>Other-currency amounts converted at their recorded rate.</Footnote>}
    </div>
  )
}

function FilterSheet({ kind, categoryId, accountId, onApply }: {
  kind: TransactionKind | ''; categoryId: string; accountId: string; onApply: (k: TransactionKind | '', c: string, a: string) => void
}) {
  const { data, closeSheet } = useApp()
  const [k, setK] = useState(kind)
  const [c, setC] = useState(categoryId)
  const [a, setA] = useState(accountId)
  return (
    <Sheet title="Filter" full={false} saveLabel="Apply" onSave={() => { onApply(k, c, a); closeSheet() }}>
      <div className="stack">
        <div className="form-card">
          <div className="form-row"><div className="label">Type</div><div className="control">
            <select className="field" value={k} onChange={(e) => setK(e.target.value as TransactionKind | '')}>
              <option value="">All types</option><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option>
            </select></div></div>
          <div className="form-row"><div className="label">Category</div><div className="control">
            <select className="field" value={c} onChange={(e) => setC(e.target.value)}>
              <option value="">All categories</option>
              {data.categories.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.kind === 'income' ? 'in' : 'out'})</option>)}
            </select></div></div>
          <div className="form-row"><div className="label">Account</div><div className="control">
            <select className="field" value={a} onChange={(e) => setA(e.target.value)}>
              <option value="">All accounts</option>
              {data.accounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select></div></div>
        </div>
        <button className="btn-secondary" onClick={() => { onApply('', '', ''); closeSheet() }}>Clear filters</button>
      </div>
    </Sheet>
  )
}

function ManageMenu() {
  const { push, closeSheet } = useApp()
  const go = (name: 'accounts' | 'categories' | 'recurring') => { closeSheet(); push({ name }) }
  return (
    <Sheet title="Manage" full={false} cancelLabel="Close">
      <div className="card list">
        <button className="list-row" onClick={() => go('accounts')}><div className="main title">Accounts</div><ChevronRight size={16} className="muted" /></button>
        <button className="list-row" onClick={() => go('categories')}><div className="main title">Categories</div><ChevronRight size={16} className="muted" /></button>
        <button className="list-row" onClick={() => go('recurring')}><div className="main title">Recurring transactions</div><ChevronRight size={16} className="muted" /></button>
      </div>
    </Sheet>
  )
}
