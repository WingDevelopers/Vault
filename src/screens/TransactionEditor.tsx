import { useMemo, useState } from 'react'
import { ArrowRightLeft, Calendar, CircleArrowDown, Landmark, Plus, Repeat, AlignLeft, Trash2 } from 'lucide-react'
import { convert, formatMoney, HIDDEN, parseAmount, parseRate, toInput } from '../core/money'
import { fmtDay, today } from '../core/dates'
import { DEFAULT_PAYDAYS, FREQUENCIES, type Currency, type Frequency, type PayDays, type Transaction, type TransactionKind } from '../core/types'
import { occurrence } from '../core/finance'
import { newId } from '../db/db'
import { deleteTransaction, saveRule, saveTransaction, updateSettings } from '../db/repo'
import { haptic, useApp } from '../state'
import { AmountInput, Confirm, DecimalField, FormCard, FormRow, Segmented, Sheet, Switch } from '../ui/components'
import { CatIcon, Icon } from '../ui/icons'
import { CategoryEditor, PayDaysRows } from './Manage'

const KINDS: { id: TransactionKind; title: string }[] = [
  { id: 'expense', title: 'Expense' }, { id: 'income', title: 'Income' }, { id: 'transfer', title: 'Transfer' },
]

/** Quick add & edit. Built for < 10 s entry: amount focused, last account preselected, one-tap categories. */
export function TransactionEditor({ tx, initialKind = 'expense' }: { tx?: Transaction; initialKind?: TransactionKind }) {
  const { data, closeSheet, openSheet, toast } = useApp()
  const { settings } = data
  const accounts = useMemo(() => data.accounts.filter((a) => !a.archived || a.id === tx?.accountId || a.id === tx?.destAccountId).sort((a, b) => a.sortOrder - b.sortOrder), [data.accounts, tx])
  const defaultAccount = accounts.find((a) => a.id === settings.lastAccountId) ?? accounts[0]

  const [kind, setKind] = useState<TransactionKind>(tx?.kind ?? initialKind)
  const [amountText, setAmountText] = useState(tx ? toInput(tx.amount) : '')
  const [currency, setCurrency] = useState<Currency>(tx?.currency ?? defaultAccount?.currency ?? settings.primaryCurrency)
  const [date, setDate] = useState(tx?.date ?? today())
  const [accountId, setAccountId] = useState(tx?.accountId ?? defaultAccount?.id ?? '')
  const [destId, setDestId] = useState(tx?.destAccountId ?? '')
  const [destText, setDestText] = useState(tx?.destAmount != null ? toInput(tx.destAmount) : '')
  const [categoryId, setCategoryId] = useState<string | null>(tx?.categoryId ?? null)
  const [note, setNote] = useState(tx?.note ?? '')
  const [rateText, setRateText] = useState(tx?.rate ?? settings.crcPerUSD)
  const [repeats, setRepeats] = useState(false)
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [days, setDays] = useState<PayDays>(DEFAULT_PAYDAYS)

  const amount = parseAmount(amountText)
  const rate = parseRate(rateText)
  const account = accounts.find((a) => a.id === accountId)
  const dest = accounts.find((a) => a.id === destId)
  const catKind = kind === 'income' ? 'income' : 'expense'
  const categories = data.categories.filter((c) => c.kind === catKind).sort((a, b) => a.sortOrder - b.sortOrder)
  const needsRate = (!!account && account.currency !== currency) || (kind === 'transfer' && !!dest && dest.currency !== currency)
  const showRate = needsRate || currency !== settings.primaryCurrency
  const destAmount = kind === 'transfer' && dest && amount
    ? (dest.currency !== currency && parseAmount(destText) ? parseAmount(destText)! : convert(amount, currency, dest.currency, rate ?? settings.crcPerUSD))
    : null

  const problem = !amount || amount <= 0 ? 'Enter an amount'
    : !account ? (accounts.length ? 'Choose an account' : 'Add an account first (Settings → Accounts)')
    : kind === 'transfer' && !dest ? 'Choose where the money goes'
    : kind === 'transfer' && dest?.id === account.id ? 'Pick two different accounts'
    : needsRate && !rate ? 'Enter the exchange rate' : null

  const pickAccount = (id: string) => {
    setAccountId(id)
    const a = accounts.find((x) => x.id === id)
    if (!tx && a && !amountText) setCurrency(a.currency)
  }

  async function save() {
    if (problem || !amount || !account) return
    const isTransfer = kind === 'transfer'
    const t: Transaction = {
      id: tx?.id ?? newId(), kind, amount, currency, date, accountId: account.id,
      destAccountId: isTransfer ? dest!.id : null, destAmount: isTransfer ? destAmount : null,
      categoryId: isTransfer ? null : categoryId, rate: rate ?? settings.crcPerUSD, note: note.trim(),
      ruleId: tx?.ruleId ?? null, createdAt: tx?.createdAt ?? Date.now(),
    }
    if (repeats && !tx) {
      const ruleId = newId()
      t.ruleId = ruleId
      await saveRule({
        id: ruleId, title: t.note || categories.find((c) => c.id === categoryId)?.name || kind[0].toUpperCase() + kind.slice(1),
        kind, amount, currency, frequency, days: frequency === 'semimonthly' ? days : null, startDate: date, endDate: null,
        // This transaction is the first occurrence unless it isn't on a payday.
        generatedCount: occurrence(0, date, frequency, days) === date ? 1 : 0, active: true,
        accountId: account.id, destAccountId: t.destAccountId, categoryId: t.categoryId, createdAt: Date.now(),
      })
    }
    await saveTransaction(t)
    await updateSettings({ lastAccountId: account.id })
    haptic()
    closeSheet()
    toast(tx ? 'Saved' : `${kind[0].toUpperCase() + kind.slice(1)} added`)
  }

  const amountColor = kind === 'income' ? 'var(--emerald)' : kind === 'transfer' ? 'var(--cyan)' : undefined

  return (
    <Sheet title={tx ? 'Edit transaction' : 'New transaction'} onSave={save} canSave={!problem}
      footer={
        <div className="stack-s" style={{ gap: 6 }}>
          {problem && amountText && <div className="muted small" style={{ textAlign: 'center' }}>{problem}</div>}
          <button className="btn-primary" disabled={!!problem} onClick={save}>{tx ? 'Save changes' : `Save ${kind}`}</button>
        </div>
      }>
      <div className="stack">
        <Segmented value={kind} options={KINDS} onChange={(k) => { setKind(k); if (k !== 'transfer') setCategoryId(null) }} />
        <AmountInput value={amountText} onChange={setAmountText} currency={currency} onCurrencyChange={setCurrency} color={amountColor} autoFocus={!tx} />

        {kind !== 'transfer' && (
          <div className="stack-s" style={{ gap: 8 }}>
            <div className="caps">Category</div>
            <div className="chips">
              {categories.map((c) => (
                <button key={c.id} className={`chip ${categoryId === c.id ? 'on' : ''}`} aria-pressed={categoryId === c.id}
                  onClick={() => { haptic(4); setCategoryId(categoryId === c.id ? null : c.id) }}>
                  <span style={{ color: categoryId === c.id ? 'var(--midnight)' : c.color, display: 'inline-flex' }}><Icon name={c.icon} size={15} /></span>
                  {c.name}
                </button>
              ))}
              <button className="chip dashed" onClick={() => openSheet(<CategoryEditor kind={catKind} />)}><Plus size={15} />New</button>
            </div>
          </div>
        )}

        <FormCard>
          <FormRow label={kind === 'transfer' ? 'From' : 'Account'} icon={<Landmark size={18} />}>
            <select className="field" value={accountId} onChange={(e) => pickAccount(e.target.value)} aria-label="Account">
              {!account && <option value="">Choose</option>}
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
            </select>
          </FormRow>
          {kind === 'transfer' && (
            <FormRow label="To" icon={<ArrowRightLeft size={18} />}>
              <select className="field" value={destId} onChange={(e) => setDestId(e.target.value)} aria-label="Destination account">
                <option value="">Choose</option>
                {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
              </select>
            </FormRow>
          )}
          {kind === 'transfer' && dest && dest.currency !== currency && (
            <FormRow label={`Received (${dest.currency})`} icon={<CircleArrowDown size={18} />}>
              <DecimalField value={destText} onChange={setDestText} placeholder={destAmount != null ? toInput(destAmount) : '0'} />
            </FormRow>
          )}
          {showRate && (
            <FormRow label="Rate ₡ per $" icon={<Icon name="circle-dollar" />}>
              <DecimalField value={rateText} onChange={setRateText} placeholder="505" />
            </FormRow>
          )}
          <FormRow label="Date" icon={<Calendar size={18} />}>
            <input type="date" className="field" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
          </FormRow>
          <FormRow label="Note" icon={<AlignLeft size={18} />}>
            <input className="field" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
          </FormRow>
        </FormCard>

        {!tx && (
          <FormCard footer={repeats ? 'Future occurrences are added automatically on their dates.' : undefined}>
            <FormRow label="Repeat" icon={<Repeat size={18} />}><Switch checked={repeats} onChange={setRepeats} label="Repeat" /></FormRow>
            {repeats && (
              <FormRow label="Every" icon={<Calendar size={18} />}>
                <select className="field" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                  {FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
              </FormRow>
            )}
            {repeats && frequency === 'semimonthly' && <PayDaysRows days={days} onChange={setDays} />}
          </FormCard>
        )}

        {tx && (
          <button className="btn-danger" onClick={() => openSheet(
            <Confirm title="Delete this transaction?" message="Account balances will be recalculated." confirmLabel="Delete"
              onConfirm={async () => { await deleteTransaction(tx.id); closeSheet(); toast('Deleted') }} />,
          )}>
            <span className="row" style={{ justifyContent: 'center', gap: 6 }}><Trash2 size={16} />Delete transaction</span>
          </button>
        )}
      </div>
    </Sheet>
  )
}

export function TransactionRow({ tx, showDate = true, onClick }: { tx: Transaction; showDate?: boolean; onClick?: () => void }) {
  const { data } = useApp()
  const cat = data.categories.find((c) => c.id === tx.categoryId)
  const acc = data.accounts.find((a) => a.id === tx.accountId)
  const dest = data.accounts.find((a) => a.id === tx.destAccountId)
  const hidden = data.settings.hideAmounts
  const title = tx.note || (tx.kind === 'transfer' ? `Transfer to ${dest?.name ?? 'account'}` : cat?.name ?? (tx.kind === 'income' ? 'Income' : 'Expense'))
  const parts: string[] = []
  if (tx.kind === 'transfer') parts.push(`${acc?.name ?? '—'} → ${dest?.name ?? '—'}`)
  else { if (cat && cat.name !== title) parts.push(cat.name); parts.push(acc?.name ?? 'No account') }
  if (showDate) parts.push(fmtDay(tx.date))
  const amountText = hidden ? HIDDEN : tx.kind === 'income' ? formatMoney(tx.amount, tx.currency, { signed: true })
    : tx.kind === 'expense' ? formatMoney(-tx.amount, tx.currency) : formatMoney(tx.amount, tx.currency)
  return (
    <button className="list-row" onClick={onClick}>
      {tx.kind === 'transfer' ? <CatIcon icon="transfer" color="#38CFFF" />
        : cat ? <CatIcon icon={cat.icon} color={cat.color} />
        : <CatIcon icon={tx.kind === 'income' ? 'arrow-down-left' : 'tag'} color="#8A9BB3" />}
      <div className="main">
        <div className="title">{title}</div>
        <div className="sub">{parts.join(' · ')}</div>
      </div>
      <div className="end">
        <div className={`num ${tx.kind === 'income' ? 'pos' : tx.kind === 'transfer' ? 'cyan' : ''}`}>{amountText}</div>
        {tx.ruleId && <div className="muted" style={{ display: 'flex', justifyContent: 'flex-end' }}><Repeat size={11} aria-label="Recurring" /></div>}
      </div>
    </button>
  )
}

