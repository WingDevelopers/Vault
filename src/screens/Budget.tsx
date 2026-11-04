import { useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight, Pencil, Plus, Undo2 } from 'lucide-react'
import { convert, formatMoney, HIDDEN, parseAmount, SYMBOL, toInput } from '../core/money'
import { addMonthsToKey, currentMonth, daysInMonth, fmtMonth, monthRange, today } from '../core/dates'
import { budgetProgress, expensesByCategory, makeProgress, summary } from '../core/finance'
import { viewCurrency, type Budget, type Currency } from '../core/types'
import { newId } from '../db/db'
import { deleteBudget, saveBudget, updateSettings } from '../db/repo'
import { haptic, useApp } from '../state'
import { Amount, AmountInput, Confirm, CurrencyToggle, DecimalField, EmptyState, Footnote, FormCard, FormRow, LargeTitle, ProgressBar, SectionHeader, Sheet, statusColor, Switch } from '../ui/components'
import { CatIcon } from '../ui/icons'
import { CategoryEditor } from './Manage'

export function BudgetScreen() {
  const { data, openSheet } = useApp()
  const { settings } = data
  const cur = viewCurrency(settings)
  const rate = settings.crcPerUSD
  const hidden = settings.hideAmounts
  const [month, setMonth] = useState(currentMonth())
  const range = monthRange(month)
  const spent = summary(data.transactions, range, cur).expenses
  const cats = new Map(data.categories.map((c) => [c.id, c]))
  const budgets = [...data.budgets].sort((a, b) => (cats.get(a.categoryId)?.sortOrder ?? 0) - (cats.get(b.categoryId)?.sortOrder ?? 0))
  const budgeted = new Set(data.budgets.map((b) => b.categoryId))
  const unbudgeted = [...expensesByCategory(data.transactions, range, cur).entries()].filter(([id]) => !budgeted.has(id)).sort((a, b) => b[1] - a[1])
  const money = (v: number) => (hidden ? HIDDEN : formatMoney(v, cur))

  // Shown in the selected currency; budgets set in another currency convert at the current rate.
  const progressFor = (b: Budget) => budgetProgress(convert(b.amount, b.currency, cur, rate), month, b.startMonth, b.rollover,
    (m) => expensesByCategory(data.transactions, monthRange(m), cur).get(b.categoryId) ?? 0)

  const allowanceCur = settings.allowanceCurrency ?? settings.primaryCurrency
  const allowance = settings.monthlyAllowance != null ? convert(settings.monthlyAllowance, allowanceCur, cur, rate) : null
  const isCurrent = month === currentMonth()
  const [y, m] = month.split('-').map(Number)
  const daysLeft = isCurrent ? daysInMonth(y, m) - Number(today().slice(8)) + 1 : 0

  return (
    <div className="screen fade-in">
      <LargeTitle title="Budget"><CurrencyToggle /></LargeTitle>
      <div className="stack" style={{ marginTop: 12 }}>
        <div className="row-between">
          <button className="icon-btn plain" aria-label="Previous month" onClick={() => setMonth(addMonthsToKey(month, -1))}><ChevronLeft size={22} /></button>
          <span className="strong" style={{ fontSize: 17 }}>{fmtMonth(month)}</span>
          <button className="icon-btn plain" aria-label="Next month" disabled={isCurrent} onClick={() => setMonth(addMonthsToKey(month, 1))}><ChevronRight size={22} /></button>
        </div>

        {allowance && allowance > 0 ? (() => {
          const p = makeProgress(allowance, 0, spent)
          return (
            <button className="card hero stack-s" style={{ textAlign: 'left' }} onClick={() => openSheet(<AllowanceEditor />)}>
              <div className="row-between"><span className="small muted strong">Monthly spending allowance</span><Pencil size={14} className="muted" /></div>
              <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
                <Amount className="big-amount rounded" style={{ fontSize: 32 }} value={p.remaining} currency={cur} colored={p.remaining < 0} />
                <span className="muted">{p.remaining < 0 ? 'over' : 'left'}</span>
              </div>
              <ProgressBar fraction={p.fraction} color={statusColor(p.status)} height={10} />
              <div className="row-between small"><span><span className="muted">Spent </span>{money(spent)}</span><span className="muted">of {money(allowance)}</span></div>
              {isCurrent && p.remaining > 0 && !hidden && (
                <Footnote icon={<Calendar size={13} />}>About {formatMoney(Math.floor(p.remaining / daysLeft), cur)} per day for the {daysLeft} days left.</Footnote>
              )}
              {allowanceCur !== cur && <Footnote>Set as {formatMoney(settings.monthlyAllowance!, allowanceCur)}; shown at ₡{rate} per $1.</Footnote>}
            </button>
          )
        })() : (
          <div className="card hero stack-s">
            <div className="strong" style={{ fontSize: 17 }}>One number to watch</div>
            <div className="muted small">Set a fixed monthly spending allowance and see what's left at a glance — no category setup required.</div>
            <div><button className="btn-primary compact" onClick={() => openSheet(<AllowanceEditor />)}>Set allowance</button></div>
          </div>
        )}

        <div className="stack-s">
          <SectionHeader title="Category budgets">
            <button className="link-btn" style={{ fontSize: 15 }} onClick={() => openSheet(<BudgetEditor />)}><Plus size={16} />Add</button>
          </SectionHeader>
          {!!budgets.length && (() => {
            const total = budgets.reduce((sum, b) => sum + convert(b.amount, b.currency, cur, rate), 0)
            if (!allowance) return <Footnote>Category budgets are separate limits for specific categories. Your total spending isn't capped unless you set an allowance above.</Footnote>
            const left = allowance - total
            return left >= 0
              ? <Footnote>Category budgets total {money(total)} of your {money(allowance)} allowance — {money(left)} is left for everything else. Every expense counts toward the allowance; budgeted ones also count toward their category.</Footnote>
              : <div className="footnote warn">Category budgets total {money(total)}, which is {money(-left)} more than your {money(allowance)} allowance. You'll go over the allowance before these budgets run out.</div>
          })()}
          {!budgets.length ? (
            <div className="card"><EmptyState icon="chart-pie" title="No category budgets" message="Set limits only where it helps — groceries, eating out, entertainment."
              action="Add a budget" onAction={() => openSheet(<BudgetEditor />)} /></div>
          ) : budgets.map((b) => {
            const c = cats.get(b.categoryId)
            const p = progressFor(b)
            return (
              <button key={b.id} className="card tight stack-s" style={{ textAlign: 'left', gap: 10 }} onClick={() => openSheet(<BudgetEditor budget={b} />)}>
                <div className="row">
                  <CatIcon icon={c?.icon ?? 'tag'} color={c?.color} size={32} />
                  <div className="main" style={{ flex: 1, minWidth: 0 }}>
                    <div className="strong" style={{ fontSize: 15 }}>{c?.name ?? 'Category'}</div>
                    <div className="small muted num">{hidden ? `${Math.round(p.fraction * 100)}% of budget` : `${formatMoney(p.spent, cur)} of ${formatMoney(p.available, cur)}`}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Amount className="strong" value={p.remaining} currency={cur} colored={p.remaining < 0} />
                    <div className="tiny" style={{ color: p.status === 'comfortable' ? 'var(--slate)' : statusColor(p.status) }}>
                      {p.remaining < 0 ? 'over' : `${Math.round(p.fraction * 100)}% used`}
                    </div>
                  </div>
                </div>
                <ProgressBar fraction={p.fraction} color={statusColor(p.status)} />
                {p.carriedOver > 0 && <Footnote icon={<Undo2 size={13} />}>Includes {money(p.carriedOver)} rolled over</Footnote>}
              </button>
            )
          })}
        </div>

        {!!unbudgeted.length && (
          <div className="stack-s">
            <SectionHeader title="Spending without a budget" />
            <div className="card list">
              {unbudgeted.map(([id, value]) => {
                const c = cats.get(id)
                return (
                  <div key={id || 'none'} className="list-row">
                    <CatIcon icon={c?.icon ?? 'tag'} color={c?.color ?? '#8A9BB3'} size={30} />
                    <div className="main title">{c?.name ?? 'Uncategorized'}</div>
                    <Amount className="end" value={value} currency={cur} />
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BudgetEditor({ budget }: { budget?: Budget }) {
  const { data, closeSheet, openSheet } = useApp()
  const currency = budget?.currency ?? viewCurrency(data.settings)
  const available = data.categories.filter((c) => c.kind === 'expense' && !data.budgets.some((b) => b.categoryId === c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? available[0]?.id ?? '')
  const [amountText, setAmountText] = useState(budget ? toInput(budget.amount) : '')
  const [rollover, setRollover] = useState(budget?.rollover ?? false)
  const amount = parseAmount(amountText)
  const valid = !!amount && amount > 0 && !!categoryId

  async function save() {
    if (!valid || !amount) return
    await saveBudget({ id: budget?.id ?? newId(), categoryId, amount, currency, rollover, startMonth: budget?.startMonth ?? currentMonth() })
    haptic(); closeSheet()
  }

  return (
    <Sheet title={budget ? 'Edit budget' : 'New budget'} onSave={save} canSave={valid} full={false}>
      <div className="stack">
        <FormCard>
          <FormRow label="Category">
            {budget ? <span>{data.categories.find((c) => c.id === budget.categoryId)?.name}</span> : (
              <select className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {!available.length && <option value="">No categories left</option>}
                {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </FormRow>
          {!budget && (
            <button className="form-row" style={{ width: '100%', color: 'var(--electric)' }}
              onClick={() => openSheet(<CategoryEditor kind="expense" onSaved={(id) => setCategoryId(id)} />)}>
              <div className="label" style={{ color: 'var(--electric)' }}><Plus size={18} />New category…</div>
            </button>
          )}
          <FormRow label="Monthly limit"><span className="muted">{SYMBOL[currency]}</span><DecimalField value={amountText} onChange={setAmountText} width={160} /></FormRow>
        </FormCard>
        <FormCard footer="Off by default. When on, money you don't spend carries into next month. Overspending never carries forward.">
          <FormRow label="Roll over unused amount"><Switch checked={rollover} onChange={setRollover} label="Roll over unused amount" /></FormRow>
        </FormCard>
        {budget && <button className="btn-danger" onClick={() => openSheet(<Confirm title="Remove this budget?" message="Your transactions aren't affected." confirmLabel="Remove budget" onConfirm={async () => { await deleteBudget(budget.id); closeSheet() }} />)}>Remove budget</button>}
      </div>
    </Sheet>
  )
}

function AllowanceEditor() {
  const { data, closeSheet } = useApp()
  const s = data.settings
  const [cur, setCur] = useState<Currency>(s.monthlyAllowance != null ? (s.allowanceCurrency ?? s.primaryCurrency) : viewCurrency(s))
  const [text, setText] = useState(toInput(s.monthlyAllowance))
  const amount = parseAmount(text)
  return (
    <Sheet title="Spending allowance" full={false} canSave={!!amount && amount > 0}
      onSave={async () => { await updateSettings({ monthlyAllowance: amount, allowanceCurrency: cur }); haptic(); closeSheet() }}>
      <div className="stack">
        <div className="muted small">How much do you want to spend each month, in total? Tap the currency sign to switch ₡ / $.</div>
        <AmountInput value={text} onChange={setText} currency={cur} onCurrencyChange={setCur} autoFocus />
        <Footnote>Counts every expense in the month. Transfers and investment contributions are not spending.</Footnote>
        {data.settings.monthlyAllowance != null && (
          <button className="btn-secondary" onClick={async () => { await updateSettings({ monthlyAllowance: null }); closeSheet() }}>Remove allowance</button>
        )}
      </div>
    </Sheet>
  )
}
