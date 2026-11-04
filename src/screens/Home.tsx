import { useMemo, useState } from 'react'
import { ArrowDownLeft, Info, ArrowUpRight, Banknote, Eye, EyeOff, Settings2, TrendingUp, VenetianMask } from 'lucide-react'
import { convert, formatMoney, nonZeroCurrencies, totalIn, type Totals } from '../core/money'
import { currentMonth, addMonthsToKey, daysInMonth, fmtDate, fmtMonth, monthRange, monthStart, today, type DateRange } from '../core/dates'
import { makeProgress, netWorth, netWorthHistory, summary, type Point } from '../core/finance'
import { viewCurrency, type Cents, type Currency } from '../core/types'
import { updateSettings } from '../db/repo'
import { haptic, useApp } from '../state'
import { Amount, CurrencyToggle, EmptyState, Footnote, LargeTitle, ProgressBar, SectionHeader, Segmented } from '../ui/components'
import { AreaChart } from '../ui/charts'
import { AccountEditor } from './Manage'
import { GoalCard, GoalEditor } from './Goals'
import { RemindersSection } from './Reminders'
import { SalarySplitCard } from './SalaryPlan'

type PeriodKind = 'this' | 'last' | 'custom'

export function Home() {
  const { data, push, openSheet, setTab } = useApp()
  const { settings } = data
  const cur = viewCurrency(settings)
  const [period, setPeriod] = useState<PeriodKind>('this')
  const [customStart, setCustomStart] = useState(monthStart(currentMonth()))
  const [customEnd, setCustomEnd] = useState(today())

  const range: DateRange = period === 'this' ? monthRange(currentMonth())
    : period === 'last' ? monthRange(addMonthsToKey(currentMonth(), -1))
    : { start: customStart <= customEnd ? customStart : customEnd, end: customStart <= customEnd ? customEnd : customStart }

  const worth = useMemo(() => netWorth(data), [data])
  const history = useMemo(() => netWorthHistory(data), [data])
  const sum = useMemo(() => summary(data.transactions, range, cur), [data.transactions, range.start, range.end, cur]) // eslint-disable-line react-hooks/exhaustive-deps
  // Expenses vs the monthly spending allowance (calendar months only).
  const budgetTotal = period !== 'custom' && settings.monthlyAllowance
    ? convert(settings.monthlyAllowance, settings.allowanceCurrency ?? settings.primaryCurrency, cur, settings.crcPerUSD) : null
  const budget = budgetTotal ? makeProgress(budgetTotal, 0, sum.expenses) : null
  const [cy, cm] = currentMonth().split('-').map(Number)
  const monthPace = period === 'this' ? Number(today().slice(8)) / daysInMonth(cy, cm) : null
  // Coral when over; amber when spending faster than the month is passing (or ≥80% used).
  const budgetColor = !budget ? undefined : budget.status === 'over' ? 'var(--coral)'
    : budget.status === 'approaching' || (monthPace !== null && budget.fraction > monthPace + 0.05) ? 'var(--amber)' : 'var(--electric)'
  const goal = data.goals.find((g) => g.isPrimary) ?? data.goals[0]

  const breakdown = (t: Totals) => (nonZeroCurrencies(t).length > 1 && !settings.hideAmounts
    ? nonZeroCurrencies(t).map((c) => formatMoney(t[c], c)).join(' + ') : undefined)

  return (
    <div className="screen fade-in">
      <LargeTitle title="Overview">
        <CurrencyToggle />
        <button className="icon-btn" aria-label={settings.hideAmounts ? 'Show amounts' : 'Hide amounts'}
          onClick={() => { haptic(); updateSettings({ hideAmounts: !settings.hideAmounts }) }}>
          {settings.hideAmounts ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
        <button className="icon-btn" aria-label="Settings" onClick={() => push({ name: 'settings' })}><Settings2 size={18} /></button>
      </LargeTitle>

      <div className="stack" style={{ marginTop: 12 }}>
        {settings.isDemo && <div className="banner"><VenetianMask size={16} />Demo data — sample numbers, not yours. Clear it in Settings.</div>}

        {!data.accounts.length && (
          <div className="card"><EmptyState icon="landmark" title="Add your first account" message="Accounts hold your balances. Start with a bank account or cash."
            action="Add account" onAction={() => openSheet(<AccountEditor />)} /></div>
        )}

        <NetWorthCard total={worth.total} history={history} currency={cur} rate={settings.crcPerUSD} rateDate={settings.rateUpdatedAt} />


        <RemindersSection />

        <div className="stack-s">
          <Segmented value={period} onChange={setPeriod} options={[{ id: 'this', title: 'This month' }, { id: 'last', title: 'Last month' }, { id: 'custom', title: 'Custom' }]} />
          {period === 'custom' && (
            <div className="form-card"><div className="form-row">
              <input type="date" className="field" style={{ textAlign: 'left' }} aria-label="From" value={customStart} onChange={(e) => e.target.value && setCustomStart(e.target.value)} />
              <span className="muted">→</span>
              <input type="date" className="field" aria-label="To" value={customEnd} onChange={(e) => e.target.value && setCustomEnd(e.target.value)} />
            </div></div>
          )}
          <div className="grid-2">
            <Metric label="Available cash" icon={<Banknote size={13} />} value={totalIn(worth.availableCash, cur, settings.crcPerUSD)} currency={cur} caption={breakdown(worth.availableCash)} />
            <Metric label="Portfolio" icon={<TrendingUp size={13} className="cyan" />} value={totalIn(worth.investments, cur, settings.crcPerUSD)} currency={cur} caption={breakdown(worth.investments)} />
            <Metric label="Income" icon={<ArrowDownLeft size={13} className="pos" />} value={sum.income} currency={cur} />
            <Metric label="Expenses" icon={<ArrowUpRight size={13} className="neg" />} value={sum.expenses} currency={cur}
              onClick={() => setTab('budget')}
              progress={budget ? { fraction: budget.fraction, color: budgetColor, marker: monthPace } : undefined}
              caption={budget ? (settings.hideAmounts ? `${Math.round(budget.fraction * 100)}% of budget`
                : budget.remaining >= 0 ? `${formatMoney(budget.remaining, cur)} left of ${formatMoney(budget.available, cur)}`
                : `${formatMoney(-budget.remaining, cur)} over ${formatMoney(budget.available, cur)}`)
                : period === 'custom' ? undefined : 'Set a monthly budget →'} />
          </div>
          {sum.includesConversions && <Footnote>Includes amounts converted at each transaction's recorded rate.</Footnote>}
        </div>

        <SalarySplitCard />

        <div className="stack-s">
          <SectionHeader title="Primary goal" />
          {goal ? (
            <button style={{ textAlign: 'left' }} onClick={() => push({ name: 'goal', id: goal.id })}><GoalCard goal={goal} compact /></button>
          ) : (
            <div className="card"><EmptyState icon="star" title="Set a goal" message="Give your savings a destination — an apartment, an emergency fund, a trip."
              action="Create goal" onAction={() => openSheet(<GoalEditor />)} /></div>
          )}
        </div>
      </div>
    </div>
  )
}

function Metric({ label, icon, value, currency, caption, colored, info, progress, onClick }: {
  label: string; icon: React.ReactNode; value: Cents; currency: Currency; caption?: string; colored?: boolean; info?: string
  progress?: { fraction: number; color?: string; marker?: number | null }; onClick?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card tight metric" style={{ position: 'relative', cursor: onClick ? 'pointer' : undefined }} onClick={onClick}
      role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="label">{icon}{label}</div>
      {info && (
        <button className="info-btn" aria-label="How this is calculated" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open) }}><Info size={14} /></button>
      )}
      <Amount className="value" value={value} currency={currency} colored={colored} />
      {progress && <ProgressBar fraction={progress.fraction} color={progress.color} marker={progress.marker} height={6} />}
      {caption && <div className="tiny muted">{caption}</div>}
      {info && open && <div className="info-bubble fade-in" role="note" onClick={() => setOpen(false)}>{info}</div>}
    </div>
  )
}

function NetWorthCard({ total, history, currency, rate, rateDate }: { total: Totals; history: Point[]; currency: Currency; rate: string; rateDate: string }) {
  const { data } = useApp()
  const hidden = data.settings.hideAmounts
  const [sel, setSel] = useState<Point | null>(null)
  const value = totalIn(total, currency, rate)
  const change = history.length >= 2 ? history[history.length - 1].value - history[history.length - 2].value : null
  const multi = nonZeroCurrencies(total).some((c) => c !== currency)
  return (
    <div className="card hero stack-s">
      <div className="row-between">
        <span className="muted small strong">{sel ? `Net worth · ${fmtMonth(sel.month)}` : 'Net worth'}</span>
        {change !== null && !sel && (
          <span className={`small strong num ${change >= 0 ? 'pos' : 'neg'}`}>
            {change >= 0 ? '↗' : '↘'} {hidden ? '••' : formatMoney(change, currency, { signed: true })} <span className="muted">this month</span>
          </span>
        )}
      </div>
      <Amount className="big-amount rounded" value={sel?.value ?? value} currency={currency} />
      {history.length >= 2 ? (
        hidden ? null : <AreaChart points={history} currency={currency} height={120} onSelect={setSel} label={`Net worth over the last ${history.length} months`} />
      ) : (
        <div className="small muted">Your net-worth trend appears here as months go by.</div>
      )}
      {multi && !hidden && (
        <>
          <div className="small strong" style={{ opacity: 0.85 }}>{nonZeroCurrencies(total).map((c) => formatMoney(total[c], c)).join('  ·  ')}</div>
          <Footnote>Total at ₡{rate} per $1, set {fmtDate(rateDate)}.</Footnote>
        </>
      )}
    </div>
  )
}
