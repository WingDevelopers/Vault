import { useState } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { convert, formatCompact, formatMoney, HIDDEN, parseAmount, SYMBOL, toInput } from '../core/money'
import { monthlyRecurringIncome, salarySplit } from '../core/finance'
import { viewCurrency, type Cents, type Currency, type SalaryPlan, type Settings } from '../core/types'
import { newId } from '../db/db'
import { updateSettings } from '../db/repo'
import { haptic, useApp } from '../state'
import { DecimalField, EmptyState, FormCard, FormRow, SectionHeader, Sheet } from '../ui/components'
import { Donut } from '../ui/charts'

const ITEM_COLORS = ['#B794F6', '#35D6A0', '#FFB86B', '#6C8CFF', '#FF8FB1', '#F4D35E', '#7FD1B9']
const UNASSIGNED = '#8A9BB3'

/** Monthly spending budget (the allowance from the Budget tab), in `cur`. */
function expensesBudget(s: Settings, cur: Currency): Cents | null {
  if (s.monthlyAllowance == null) return null
  return convert(s.monthlyAllowance, s.allowanceCurrency ?? s.primaryCurrency, cur, s.crcPerUSD)
}

/** Home card: how the monthly salary splits into the expenses budget, investments and other buckets — all planned. */
export function SalarySplitCard() {
  const { data, openSheet, setTab } = useApp()
  const s = data.settings
  const cur = viewCurrency(s)
  const hidden = s.hideAmounts
  const budget = expensesBudget(s, cur)
  const split = salarySplit(s.salaryPlan, data.rules, budget ?? 0, cur, s.crcPerUSD)
  const money = (v: Cents) => (hidden ? HIDDEN : formatMoney(v, cur))
  const pct = (v: Cents) => (split.salary > 0 ? `${Math.round((v / split.salary) * 100)}%` : '')
  const rows = [...split.slices, ...(split.unassigned > 0 ? [{ key: 'left', label: 'Unassigned', value: split.unassigned, color: UNASSIGNED }] : [])]

  return (
    <div className="stack-s">
      <SectionHeader title="Salary split">
        <button className="link-btn" style={{ fontSize: 15 }} onClick={() => openSheet(<SalaryPlanEditor />)}><Pencil size={14} />&nbsp;Edit</button>
      </SectionHeader>
      {split.salary <= 0 ? (
        <div className="card"><EmptyState icon="briefcase" title="Show where your salary goes"
          message="Add your salary as recurring income (or type it in), then set how much goes to investments and other buckets."
          action="Set up" onAction={() => openSheet(<SalaryPlanEditor />)} /></div>
      ) : (
        <div className="card stack-s">
          <div className="row" style={{ gap: 18, alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 120, height: 120, flex: 'none' }}>
              <Donut slices={rows.map((r) => ({ value: Math.max(0, r.value), color: r.color, label: r.key }))} />
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
                <div>
                  <div className="strong num" style={{ fontSize: 16 }}>{hidden ? '••••' : formatCompact(split.salary, cur, true)}</div>
                </div>
              </div>
            </div>
            <div className="stack-s" style={{ flex: 1, gap: 8, minWidth: 0 }}>
              {rows.map((r) => (
                <div key={r.key} className="row-between small" style={{ gap: 8 }}>
                  <span className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span className="legend-dot" style={{ background: r.color, flex: 'none' }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                  </span>
                  <span className="num" style={{ whiteSpace: 'nowrap' }}>
                    <span className="muted">{pct(r.value)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          {split.unassigned < 0 && (
            <div className="footnote neg">Over your salary by {money(-split.unassigned)} — your expenses budget plus your plan are more than you earn.</div>
          )}
          {budget == null && (
            <button className="footnote" style={{ color: 'var(--electric)', textAlign: 'left' }} onClick={() => setTab('budget')}>
              Set a monthly spending budget in Budget to include expenses →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function SalaryPlanEditor() {
  const { data, closeSheet } = useApp()
  const s = data.settings
  const plan = s.salaryPlan
  const cur: Currency = plan?.currency ?? viewCurrency(s)
  const fromRules = monthlyRecurringIncome(data.rules, cur, s.crcPerUSD)
  const [salaryText, setSalaryText] = useState(plan?.salary != null ? toInput(plan.salary) : '')
  const [invText, setInvText] = useState(plan?.investments ? toInput(plan.investments) : '')
  const [items, setItems] = useState(plan?.items.map((i) => ({ ...i, text: toInput(i.amount) })) ?? [])

  const budget = expensesBudget(s, cur) ?? 0
  const salary = salaryText.trim() ? parseAmount(salaryText) ?? 0 : fromRules
  const planned = budget + (parseAmount(invText) ?? 0) + items.reduce((sum, i) => sum + (parseAmount(i.text) ?? 0), 0)
  const left = salary - planned
  const valid = salary > 0 && left >= 0 && items.every((i) => i.name.trim())

  async function save() {
    if (!valid) return
    const next: SalaryPlan = {
      currency: cur,
      salary: salaryText.trim() ? parseAmount(salaryText) : null,
      investments: parseAmount(invText) ?? 0,
      items: items.map((i) => ({ id: i.id, name: i.name.trim(), amount: parseAmount(i.text) ?? 0, color: i.color })),
    }
    await updateSettings({ salaryPlan: next })
    haptic()
    closeSheet()
  }

  const addItem = () => setItems([...items, { id: newId(), name: '', amount: 0, text: '', color: ITEM_COLORS[items.length % ITEM_COLORS.length] }])

  return (
    <Sheet title="Salary split" onSave={save} canSave={valid}>
      <div className="stack">
        <FormCard footer={fromRules > 0
          ? `From your recurring income: ${formatMoney(fromRules, cur)} a month. Type a number only to override it.`
          : 'No recurring income yet — type your monthly salary, or add it under Activity → ⋯ → Recurring.'}>
          <FormRow label="Monthly salary"><span className="muted">{SYMBOL[cur]}</span>
            <DecimalField value={salaryText} onChange={setSalaryText} placeholder={fromRules > 0 ? toInput(fromRules) : '0'} width={150} /></FormRow>
        </FormCard>

        <FormCard title="Plan" footer="The expenses amount is your monthly spending budget — change it in the Budget tab.">
          <FormRow label={<span className="row" style={{ gap: 8 }}><span className="legend-dot" style={{ background: '#FF6B78' }} />Expenses budget</span>}>
            <span className="num muted">{s.monthlyAllowance == null ? 'Not set' : formatMoney(budget, cur)}</span>
          </FormRow>
          <FormRow label={<span className="row" style={{ gap: 8 }}><span className="legend-dot" style={{ background: '#38CFFF' }} />Investments</span>}>
            <span className="muted">{SYMBOL[cur]}</span><DecimalField value={invText} onChange={setInvText} width={130} />
          </FormRow>
          {items.map((it, idx) => (
            <div className="form-row" key={it.id}>
              <span className="legend-dot" style={{ background: it.color, flex: 'none' }} />
              <input className="field" style={{ textAlign: 'left', flex: 1 }} placeholder="e.g. Adventure fund" value={it.name} aria-label="Category name"
                onChange={(e) => setItems(items.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
              <span className="muted">{SYMBOL[cur]}</span>
              <DecimalField value={it.text} width={110} onChange={(v) => setItems(items.map((x, i) => (i === idx ? { ...x, text: v } : x)))} />
              <button className="icon-btn plain" style={{ width: 28, height: 28 }} aria-label={`Remove ${it.name || 'category'}`}
                onClick={() => setItems(items.filter((_, i) => i !== idx))}><X size={16} /></button>
            </div>
          ))}
          <button className="form-row" style={{ width: '100%' }} onClick={addItem}>
            <div className="label" style={{ color: 'var(--electric)' }}><Plus size={18} />Add category</div>
          </button>
        </FormCard>

        <div className="card tight stack-s" style={{ gap: 6 }}>
          <div className="row-between small"><span className="muted">Salary</span><span className="num">{formatMoney(salary, cur)}</span></div>
          <div className="row-between small"><span className="muted">Planned (expenses + investments + categories)</span><span className="num">{formatMoney(planned, cur)}</span></div>
          <div className="row-between small strong">
            <span>{left >= 0 ? 'Unassigned' : 'Over your salary'}</span>
            <span className={`num ${left < 0 ? 'neg' : ''}`}>{formatMoney(Math.abs(left), cur)}</span>
          </div>
        </div>
        {left < 0 && <div className="small neg">Your plan adds up to more than your salary. Lower an amount so the total matches.</div>}
      </div>
    </Sheet>
  )
}

