import { useMemo, useState } from 'react'
import { ChevronRight, Ellipsis, Plus } from 'lucide-react'
import { formatPercent, nonZeroCurrencies, parseAmount, parseRate, SYMBOL, totalIn } from '../core/money'
import { fmtDate, fmtDay, today } from '../core/dates'
import { allocation, holding, portfolioHistory, portfolioTotals } from '../core/finance'
import { ASSET_TYPES, CURRENCIES, viewCurrency, type AssetType, type Contribution, type Currency, type Investment, type Valuation } from '../core/types'
import { newId } from '../db/db'
import { deleteContribution, deleteInvestment, deleteValuation, saveContribution, saveInvestment, saveValuation } from '../db/repo'
import { haptic, useApp } from '../state'
import { Amount, AmountInput, Confirm, CurrencyToggle, DecimalField, EmptyState, Footnote, FormCard, FormRow, LargeTitle, NavBar, SectionHeader, Sheet } from '../ui/components'
import { AreaChart, CHART_PALETTE, Donut } from '../ui/charts'
import { ASSET_ICON, CatIcon } from '../ui/icons'

const assetColor = (t: AssetType) => CHART_PALETTE[ASSET_TYPES.findIndex((a) => a.id === t) % CHART_PALETTE.length]
const assetTitle = (t: AssetType) => ASSET_TYPES.find((a) => a.id === t)?.title ?? t

export function Investments() {
  const { data, openSheet, push } = useApp()
  const { settings } = data
  const cur = viewCurrency(settings)
  const hidden = settings.hideAmounts
  const totals = useMemo(() => portfolioTotals(data.investments, data), [data])
  const history = useMemo(() => portfolioHistory(data.investments, data, cur, settings.crcPerUSD), [data, cur, settings.crcPerUSD])
  const alloc = useMemo(() => allocation(data.investments, data, cur, settings.crcPerUSD), [data, cur, settings.crcPerUSD])
  const allocTotal = alloc.reduce((s, a) => s + a.value, 0)
  const value = totalIn(totals.value, cur, settings.crcPerUSD)
  const contributed = totalIn(totals.contributed, cur, settings.crcPerUSD)
  const gain = totalIn(totals.gain, cur, settings.crcPerUSD)
  const basis = totalIn(totals.basisWithValue, cur, settings.crcPerUSD)
  const investments = [...data.investments].sort((a, b) => a.createdAt - b.createdAt)

  return (
    <div className="screen fade-in">
      <LargeTitle title="Investments">
        <CurrencyToggle />
        <button className="icon-btn" aria-label="Add investment" onClick={() => openSheet(<InvestmentEditor />)}><Plus size={18} /></button>
      </LargeTitle>
      <div className="stack" style={{ marginTop: 12 }}>
        {!investments.length ? (
          <div className="card"><EmptyState icon="trending-up" title="Track your investments"
            message="Add funds, ETFs, stocks or bonds manually. Record what you put in and update the market value whenever you check your statement."
            action="Add investment" onAction={() => openSheet(<InvestmentEditor />)} /></div>
        ) : (
          <>
            <div className="card hero stack-s">
              <span className="small muted strong">Portfolio value</span>
              <Amount className="big-amount rounded" value={value} currency={cur} />
              <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
                <div><div className="tiny muted">Invested capital</div><Amount className="strong" value={contributed} currency={cur} /></div>
                <div>
                  <div className="tiny muted">Unrealized gain</div>
                  {totals.valuedCount ? (
                    <span className="row" style={{ gap: 4 }}>
                      <Amount className="strong" value={gain} currency={cur} signed colored />
                      {!hidden && basis > 0 && <span className={`small ${gain >= 0 ? 'pos' : 'neg'}`}>({formatPercent(gain / basis, 1)})</span>}
                    </span>
                  ) : <span className="muted small">Needs a market value</span>}
                </div>
              </div>
              {history.length >= 2 && !hidden && (
                <>
                  <AreaChart points={history} currency={cur} height={140} color="#38CFFF" label="Portfolio value versus money contributed" />
                  <div className="row tiny muted" style={{ gap: 16 }}>
                    <span className="row" style={{ gap: 6 }}><span className="legend-dot" style={{ background: 'var(--cyan)' }} />Market value</span>
                    <span className="row" style={{ gap: 6 }}><span className="legend-dot" style={{ background: 'var(--slate)' }} />Contributed (dashed)</span>
                  </div>
                </>
              )}
              {nonZeroCurrencies(totals.value).some((c) => c !== cur) && <Footnote>Converted at ₡{settings.crcPerUSD} per $1. Holdings keep their own currency.</Footnote>}
              <Footnote>Gains only count once you enter a market value. Contributions are never shown as performance.</Footnote>
            </div>

            {!!alloc.length && (
              <div className="stack-s">
                <SectionHeader title="Allocation" />
                <div className="card row" style={{ gap: 20 }}>
                  <Donut slices={alloc.map((a) => ({ value: a.value, color: assetColor(a.type), label: a.type }))} />
                  <div className="stack-s" style={{ flex: 1, gap: 8 }}>
                    {alloc.map((a) => (
                      <div key={a.type} className="row-between small">
                        <span className="row" style={{ gap: 8 }}><span className="legend-dot" style={{ background: assetColor(a.type) }} />{assetTitle(a.type)}</span>
                        <span className="muted num">{formatPercent(a.value / allocTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="stack-s">
              <SectionHeader title="Holdings" />
              <div className="card list">
                {investments.map((inv) => {
                  const h = holding(inv, data)
                  return (
                    <button key={inv.id} className="list-row" onClick={() => push({ name: 'investment', id: inv.id })}>
                      <CatIcon icon={ASSET_ICON[inv.assetType]} color="#38CFFF" />
                      <div className="main">
                        <div className="title">{inv.name}</div>
                        <div className="sub">{assetTitle(inv.assetType)} · {h.lastValuationDate ? `valued ${fmtDay(h.lastValuationDate)}` : 'no market value yet'}</div>
                      </div>
                      <div className="end">
                        <Amount value={h.value} currency={inv.currency} />
                        {h.gain !== null && <div className="tiny"><Amount value={h.gain} currency={inv.currency} signed colored /></div>}
                      </div>
                      <ChevronRight size={16} className="muted" />
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function InvestmentDetail({ id }: { id: string }) {
  const { data, openSheet, closeSheet, pop } = useApp()
  const inv = data.investments.find((i) => i.id === id)
  if (!inv) return <div className="screen with-nav"><NavBar title="Investment" /><div className="muted">This investment was deleted.</div></div>
  const h = holding(inv, data)
  const history = portfolioHistory([inv], data, inv.currency, data.settings.crcPerUSD)
  type Item = { kind: 'c'; c: Contribution } | { kind: 'v'; v: Valuation }
  const items: Item[] = [
    ...data.contributions.filter((c) => c.investmentId === id).map((c) => ({ kind: 'c' as const, c })),
    ...data.valuations.filter((v) => v.investmentId === id).map((v) => ({ kind: 'v' as const, v })),
  ].sort((a, b) => {
    const da = a.kind === 'c' ? a.c.date : a.v.date, dbb = b.kind === 'c' ? b.c.date : b.v.date
    return da === dbb ? (a.kind === 'v' ? -1 : 1) : da < dbb ? 1 : -1
  })

  const menu = (
    <button className="link-btn" aria-label="More" onClick={() => openSheet(
      <Sheet title={inv.name} full={false} cancelLabel="Close">
        <div className="stack-s">
          <button className="btn-secondary" onClick={() => { closeSheet(); openSheet(<InvestmentEditor investment={inv} />) }}>Edit investment</button>
          <button className="btn-danger" onClick={() => { closeSheet(); openSheet(
            <Confirm title={`Delete ${inv.name}?`} message="Its contributions and valuations are removed. Accounts that funded it will show the money as returned."
              confirmLabel="Delete" onConfirm={async () => { await deleteInvestment(inv.id); pop() }} />) }}>Delete investment</button>
        </div>
      </Sheet>,
    )}><Ellipsis size={22} /></button>
  )

  return (
    <div className="screen with-nav slide-in">
      <NavBar title={inv.name} right={menu} />
      <div className="stack">
        <div className="card hero stack-s">
          <span className="small muted strong">{assetTitle(inv.assetType)} · {inv.currency}</span>
          <Amount className="big-amount rounded" style={{ fontSize: 34 }} value={h.value} currency={inv.currency} />
          <div className="row" style={{ gap: 24, alignItems: 'flex-start' }}>
            <div><div className="tiny muted">Net contributions</div><Amount className="strong" value={h.netContributions} currency={inv.currency} /></div>
            <div>
              <div className="tiny muted">Unrealized gain</div>
              {h.gain !== null ? (
                <span className="row" style={{ gap: 4 }}>
                  <Amount className="strong" value={h.gain} currency={inv.currency} signed colored />
                  {h.gainPct !== null && !data.settings.hideAmounts && <span className={`small ${h.gain >= 0 ? 'pos' : 'neg'}`}>{formatPercent(h.gainPct, 1)}</span>}
                </span>
              ) : <span className="muted small">Add a market value</span>}
            </div>
          </div>
          {history.length >= 2 && !data.settings.hideAmounts && <AreaChart points={history} currency={inv.currency} height={110} color="#38CFFF" showAxis={false} label="Value versus contributions" />}
          {h.lastValuationDate && <Footnote>Market value last updated {fmtDate(h.lastValuationDate)}. Later contributions are added at cost.</Footnote>}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button className="btn-secondary" onClick={() => openSheet(<ValuationEditor inv={inv} />)}>Update value</button>
          <button className="btn-secondary" onClick={() => openSheet(<ContributionEditor inv={inv} withdrawal={false} />)}>Add</button>
          <button className="btn-secondary" onClick={() => openSheet(<ContributionEditor inv={inv} withdrawal />)}>Withdraw</button>
        </div>

        <div className="stack-s">
          <SectionHeader title="History" />
          {!items.length ? <div className="card muted small">No contributions or valuations yet.</div> : (
            <div className="card list">
              {items.map((it) => it.kind === 'c' ? (
                <button key={it.c.id} className="list-row" onClick={() => openSheet(
                  <Confirm title="Delete this entry?" message="Balances and value will be recalculated." confirmLabel="Delete" onConfirm={() => deleteContribution(it.c.id)} />)}>
                  <CatIcon icon={it.c.amount >= 0 ? 'arrow-down-left' : 'arrow-up-right'} color={it.c.amount >= 0 ? '#00A8FF' : '#FFB86B'} size={32} />
                  <div className="main">
                    <div className="title">{it.c.amount >= 0 ? 'Contribution' : 'Withdrawal'}</div>
                    <div className="sub">{[fmtDate(it.c.date), data.accounts.find((a) => a.id === it.c.sourceAccountId)?.name, it.c.note].filter(Boolean).join(' · ')}</div>
                  </div>
                  <Amount className="end" value={it.c.amount} currency={inv.currency} signed />
                </button>
              ) : (
                <button key={it.v.id} className="list-row" onClick={() => openSheet(
                  <Confirm title="Delete this valuation?" message="The previous market value will be used instead." confirmLabel="Delete" onConfirm={() => deleteValuation(it.v.id)} />)}>
                  <CatIcon icon="chart-line" color="#38CFFF" size={32} />
                  <div className="main"><div className="title">Market value</div><div className="sub">{fmtDate(it.v.date)}</div></div>
                  <Amount className="end" value={it.v.value} currency={inv.currency} />
                </button>
              ))}
            </div>
          )}
          {!!items.length && <Footnote>Tap an entry to delete it.</Footnote>}
        </div>
        {inv.notes && <div className="stack-s"><SectionHeader title="Notes" /><div className="card small">{inv.notes}</div></div>}
      </div>
    </div>
  )
}

export function InvestmentEditor({ investment }: { investment?: Investment }) {
  const { data, closeSheet } = useApp()
  const accounts = data.accounts.filter((a) => !a.archived)
  const [name, setName] = useState(investment?.name ?? '')
  const [type, setType] = useState<AssetType>(investment?.assetType ?? 'fund')
  const [currency, setCurrency] = useState<Currency>(investment?.currency ?? 'USD')
  const [notes, setNotes] = useState(investment?.notes ?? '')
  const [initial, setInitial] = useState('')
  const [source, setSource] = useState('')
  const [value, setValue] = useState('')

  async function save() {
    if (!name.trim()) return
    const inv: Investment = { id: investment?.id ?? newId(), name: name.trim(), assetType: type, currency, notes, createdAt: investment?.createdAt ?? Date.now() }
    await saveInvestment(inv)
    if (!investment) {
      const amt = parseAmount(initial)
      if (amt && amt > 0) await saveContribution({ id: newId(), investmentId: inv.id, date: today(), amount: amt, note: 'Initial', rate: data.settings.crcPerUSD, sourceAccountId: source || null })
      const v = parseAmount(value)
      if (value.trim() && v !== null && v >= 0) await saveValuation({ id: newId(), investmentId: inv.id, date: today(), value: v })
    }
    haptic(); closeSheet()
  }

  return (
    <Sheet title={investment ? 'Edit investment' : 'New investment'} onSave={save} canSave={!!name.trim()}>
      <div className="stack">
        <FormCard>
          <FormRow label="Name"><input className="field" placeholder="e.g. S&P 500 ETF" value={name} onChange={(e) => setName(e.target.value)} /></FormRow>
          <FormRow label="Asset type">
            <select className="field" value={type} onChange={(e) => setType(e.target.value as AssetType)}>
              {ASSET_TYPES.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </FormRow>
          <FormRow label="Currency">
            <select className="field" value={currency} disabled={!!investment} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{SYMBOL[c]} {c}</option>)}
            </select>
          </FormRow>
        </FormCard>
        {!investment && (
          <FormCard title="Starting position" footer="“Amount invested” is your cost basis. Choose “Paid from” only if that money is still in the account's balance — it will be moved out so it isn't counted twice.">
            <FormRow label="Amount invested"><span className="muted">{SYMBOL[currency]}</span><DecimalField value={initial} onChange={setInitial} placeholder="Optional" width={130} /></FormRow>
            <FormRow label="Paid from">
              <select className="field" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Not tracked</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
              </select>
            </FormRow>
            <FormRow label="Market value today"><span className="muted">{SYMBOL[currency]}</span><DecimalField value={value} onChange={setValue} placeholder="Optional" width={130} /></FormRow>
          </FormCard>
        )}
        <FormCard title="Notes">
          <div className="form-row"><textarea className="field" rows={3} placeholder="Broker, ticker, strategy…" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </FormCard>
      </div>
    </Sheet>
  )
}

function ContributionEditor({ inv, withdrawal }: { inv: Investment; withdrawal: boolean }) {
  const { data, closeSheet } = useApp()
  const accounts = data.accounts.filter((a) => !a.archived)
  const [text, setText] = useState('')
  const [date, setDate] = useState(today())
  const [accountId, setAccountId] = useState('')
  const [rateText, setRateText] = useState(data.settings.crcPerUSD)
  const [note, setNote] = useState('')
  const amount = parseAmount(text)
  const account = accounts.find((a) => a.id === accountId)
  const needsRate = !!account && account.currency !== inv.currency
  const rate = parseRate(rateText)
  const valid = !!amount && amount > 0 && (!needsRate || !!rate)

  async function save() {
    if (!valid || !amount) return
    await saveContribution({ id: newId(), investmentId: inv.id, date, amount: withdrawal ? -amount : amount, note, rate: rate ?? data.settings.crcPerUSD, sourceAccountId: accountId || null })
    haptic(); closeSheet()
  }
  return (
    <Sheet title={withdrawal ? 'Withdraw' : 'Add contribution'} onSave={save} canSave={valid}>
      <div className="stack">
        <AmountInput value={text} onChange={setText} currency={inv.currency} autoFocus />
        <FormCard footer={withdrawal ? 'Withdrawals reduce invested capital. If you pick an account, the money is added back to it.'
          : "Contributions raise invested capital and value equally — they're never counted as a gain. If you pick an account, its balance goes down by the same amount."}>
          <FormRow label="Date"><input type="date" className="field" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></FormRow>
          <FormRow label={withdrawal ? 'Deposit to' : 'Paid from'}>
            <select className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Not tracked</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
            </select>
          </FormRow>
          {needsRate && <FormRow label="Rate ₡ per $"><DecimalField value={rateText} onChange={setRateText} /></FormRow>}
          <FormRow label="Note"><input className="field" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} /></FormRow>
        </FormCard>
      </div>
    </Sheet>
  )
}

function ValuationEditor({ inv }: { inv: Investment }) {
  const { closeSheet } = useApp()
  const [text, setText] = useState('')
  const [date, setDate] = useState(today())
  const v = parseAmount(text)
  return (
    <Sheet title="Update value" full={false} canSave={v !== null && v >= 0}
      onSave={async () => { if (v === null) return; await saveValuation({ id: newId(), investmentId: inv.id, date, value: v }); haptic(); closeSheet() }}>
      <div className="stack">
        <div className="small muted">Enter the total market value shown on your statement or broker app.</div>
        <AmountInput value={text} onChange={setText} currency={inv.currency} autoFocus />
        <FormCard><FormRow label="As of"><input type="date" className="field" max={today()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></FormRow></FormCard>
        <Footnote>Prices are never fetched or estimated — this is exactly what you enter. It counts contributions dated on or before this day.</Footnote>
      </div>
    </Sheet>
  )
}

