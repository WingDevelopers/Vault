import { useState } from 'react'
import { Plus } from 'lucide-react'
import { CURRENCY_NAME, parseAmount, SYMBOL, toInput } from '../core/money'
import { addDays, fmtDay, today } from '../core/dates'
import { balance, nextOccurrence } from '../core/finance'
import {
  ACCOUNT_KINDS, CURRENCIES, DEFAULT_PAYDAYS, FREQUENCIES,
  type PayDays, type Account, type AccountKind, type Category, type CategoryKind, type Currency, type Frequency, type RecurringRule, type TransactionKind,
} from '../core/types'
import { newId } from '../db/db'
import { deleteAccount, deleteCategory, deleteRule, runRecurring, saveAccount, saveCategory, saveRule } from '../db/repo'
import { haptic, useApp } from '../state'
import { Amount, Confirm, DecimalField, EmptyState, FormCard, FormRow, Footnote, NavBar, Segmented, Sheet, Switch } from '../ui/components'
import { ACCOUNT_ICON, CATEGORY_ICON_CHOICES, COLOR_CHOICES, CatIcon, Icon } from '../ui/icons'

// ============================================================================
// Accounts
// ============================================================================

export function AccountsPage() {
  const { data, openSheet } = useApp()
  const accounts = [...data.accounts].sort((a, b) => a.sortOrder - b.sortOrder)
  return (
    <div className="screen with-nav slide-in">
      <NavBar title="Accounts" right={<button className="link-btn" aria-label="Add account" onClick={() => openSheet(<AccountEditor />)}><Plus size={22} /></button>} />
      <div className="stack">
        {!accounts.length && (
          <div className="card"><EmptyState icon="landmark" title="No accounts" message="Add bank accounts, cash, savings or brokerage cash to track balances."
            action="Add account" onAction={() => openSheet(<AccountEditor />)} /></div>
        )}
        {ACCOUNT_KINDS.map((k) => {
          const items = accounts.filter((a) => a.kind === k.id)
          if (!items.length) return null
          return (
            <div className="stack-s" key={k.id} style={{ gap: 6 }}>
              <div className="caps">{k.title}</div>
              <div className="card list">
                {items.map((a) => (
                  <button key={a.id} className="list-row" onClick={() => openSheet(<AccountEditor account={a} />)}>
                    <CatIcon icon={ACCOUNT_ICON[a.kind]} />
                    <div className="main">
                      <div className="title" style={{ color: a.archived ? 'var(--slate)' : undefined }}>{a.name}</div>
                      <div className="sub">{a.archived ? `Archived · ${a.currency}` : CURRENCY_NAME[a.currency]}</div>
                    </div>
                    <Amount className="end" value={balance(a, data)} currency={a.currency} />
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        <Footnote>Investment accounts hold uninvested cash. Holdings live in Investments; a contribution moves money from an account into a holding, so nothing is counted twice.</Footnote>
      </div>
    </div>
  )
}

export function AccountEditor({ account, onSaved }: { account?: Account; onSaved?: (a: Account) => void }) {
  const { data, closeSheet, openSheet, toast } = useApp()
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank')
  const [currency, setCurrency] = useState<Currency>(account?.currency ?? data.settings.primaryCurrency)
  const [opening, setOpening] = useState(account && account.openingBalance !== 0 ? toInput(account.openingBalance) : '')
  const [openingDate, setOpeningDate] = useState(account?.openingDate ?? today())
  const [archived, setArchived] = useState(account?.archived ?? false)
  const openingCents = opening.trim() ? parseAmount(opening) : 0
  const hasTx = !!account && data.transactions.some((t) => t.accountId === account.id || t.destAccountId === account.id)
  const txCount = account ? data.transactions.filter((t) => t.accountId === account.id || t.destAccountId === account.id).length : 0
  const valid = name.trim() !== '' && openingCents !== null

  async function save() {
    if (!valid) return
    const a: Account = {
      id: account?.id ?? newId(), name: name.trim(), kind, currency, openingBalance: openingCents ?? 0, openingDate, archived,
      sortOrder: account?.sortOrder ?? data.accounts.length, createdAt: account?.createdAt ?? Date.now(),
    }
    await saveAccount(a)
    haptic()
    closeSheet()
    onSaved?.(a)
  }

  return (
    <Sheet title={account ? 'Edit account' : 'New account'} onSave={save} canSave={valid}>
      <div className="stack">
        <FormCard>
          <FormRow label="Name"><input className="field" placeholder="e.g. BAC Colones" value={name} onChange={(e) => setName(e.target.value)} /></FormRow>
          <FormRow label="Type">
            <select className="field" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {ACCOUNT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
            </select>
          </FormRow>
          <FormRow label="Currency">
            <select className="field" value={currency} disabled={hasTx} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{SYMBOL[c]} {c}</option>)}
            </select>
          </FormRow>
        </FormCard>
        <FormCard footer="The balance on that date. Later transactions adjust it.">
          <FormRow label="Opening balance"><span className="muted">{SYMBOL[currency]}</span><DecimalField value={opening} onChange={setOpening} width={160} /></FormRow>
          <FormRow label="Balance as of"><input type="date" className="field" value={openingDate} onChange={(e) => e.target.value && setOpeningDate(e.target.value)} /></FormRow>
        </FormCard>
        {account && (
          <>
            <FormCard footer="Archived accounts keep their history and still count toward net worth, but are hidden when adding transactions.">
              <FormRow label="Archived"><Switch checked={archived} onChange={setArchived} label="Archived" /></FormRow>
            </FormCard>
            <button className="btn-danger" onClick={() => openSheet(
              <Confirm title={`Delete ${account.name}?`} message={`${txCount} transactions will be permanently deleted. Consider archiving instead.`}
                confirmLabel="Delete account and its transactions" onConfirm={async () => { await deleteAccount(account.id); closeSheet(); toast('Account deleted') }} />,
            )}>Delete account</button>
          </>
        )}
      </div>
    </Sheet>
  )
}

// ============================================================================
// Categories
// ============================================================================

export function CategoriesPage() {
  const { data, openSheet } = useApp()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const items = data.categories.filter((c) => c.kind === kind).sort((a, b) => a.sortOrder - b.sortOrder)
  const count = (id: string) => data.transactions.filter((t) => t.categoryId === id).length

  async function move(c: Category, dir: -1 | 1) {
    const i = items.indexOf(c), j = i + dir
    if (j < 0 || j >= items.length) return
    const reordered = [...items]
    ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
    await Promise.all(reordered.map((x, idx) => saveCategory({ ...x, sortOrder: idx })))
  }

  return (
    <div className="screen with-nav slide-in">
      <NavBar title="Categories" right={<button className="link-btn" aria-label="Add category" onClick={() => openSheet(<CategoryEditor kind={kind} />)}><Plus size={22} /></button>} />
      <div className="stack">
        <Segmented value={kind} onChange={setKind} options={[{ id: 'expense', title: 'Expenses' }, { id: 'income', title: 'Income' }]} />
        <div className="card list">
          {items.map((c, i) => (
            <div key={c.id} className="list-row">
              <button className="row" style={{ flex: 1, minWidth: 0, textAlign: 'left' }} onClick={() => openSheet(<CategoryEditor category={c} kind={c.kind} />)}>
                <CatIcon icon={c.icon} color={c.color} size={32} />
                <div className="main"><div className="title">{c.name}</div><div className="sub">{count(c.id)} transactions</div></div>
              </button>
              <button className="icon-btn plain" aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => move(c, -1)}>↑</button>
              <button className="icon-btn plain" aria-label={`Move ${c.name} down`} disabled={i === items.length - 1} onClick={() => move(c, 1)}>↓</button>
            </div>
          ))}
        </div>
        <Footnote>Deleting a category keeps its transactions; they become uncategorized.</Footnote>
      </div>
    </div>
  )
}

export function CategoryEditor({ category, kind }: { category?: Category; kind: CategoryKind }) {
  const { data, closeSheet, openSheet } = useApp()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? 'tag')
  const [color, setColor] = useState(category?.color ?? '#00A8FF')

  async function save() {
    if (!name.trim()) return
    await saveCategory({
      id: category?.id ?? newId(), name: name.trim(), kind, icon, color, isDefault: category?.isDefault ?? false,
      sortOrder: category?.sortOrder ?? data.categories.filter((c) => c.kind === kind).length,
    })
    haptic()
    closeSheet()
  }

  return (
    <Sheet title={category ? 'Edit category' : `New ${kind} category`} onSave={save} canSave={!!name.trim()}>
      <div className="stack">
        <div className="form-card"><div className="form-row">
          <CatIcon icon={icon} color={color} size={40} />
          <input className="field" style={{ textAlign: 'left' }} placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} />
        </div></div>
        <div className="stack-s"><div className="caps">Color</div>
          <div className="chips" style={{ gap: 12 }}>
            {COLOR_CHOICES.map((c) => (
              <button key={c} aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}
                style={{ width: 32, height: 32, borderRadius: 16, background: c, boxShadow: color === c ? '0 0 0 3px var(--midnight), 0 0 0 5px #fff' : 'none' }} />
            ))}
          </div>
        </div>
        <div className="stack-s"><div className="caps">Icon</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 8 }}>
            {CATEGORY_ICON_CHOICES.map((i) => (
              <button key={i} aria-label={i} aria-pressed={icon === i} onClick={() => setIcon(i)}
                style={{ height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: icon === i ? 'var(--electric)' : 'var(--raised)', color: icon === i ? 'var(--midnight)' : 'var(--white)' }}>
                <Icon name={i} size={19} />
              </button>
            ))}
          </div>
        </div>
        {category && (
          <button className="btn-danger" onClick={() => openSheet(
            <Confirm title={`Delete ${category.name}?`} message="Its transactions stay and become uncategorized. Its budget is removed." confirmLabel="Delete"
              onConfirm={async () => { await deleteCategory(category.id); closeSheet() }} />,
          )}>Delete category</button>
        )}
      </div>
    </Sheet>
  )
}

// ============================================================================
// Recurring
// ============================================================================

const ordinal = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`
export const describePaydays = (d: PayDays) => `${ordinal(d[0])} & ${d[1] === 31 ? 'last day' : ordinal(d[1])}`

/** Two paydays per month, e.g. the 15th and the last day (quincena). */
export function PayDaysRows({ days, onChange }: { days: PayDays; onChange: (d: PayDays) => void }) {
  return (
    <>
      <FormRow label="First payday">
        <select className="field" value={days[0]} onChange={(e) => onChange([Number(e.target.value), days[1]])} aria-label="First payday">
          {Array.from({ length: 15 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
        </select>
      </FormRow>
      <FormRow label="Second payday">
        <select className="field" value={days[1]} onChange={(e) => onChange([days[0], Number(e.target.value)])} aria-label="Second payday">
          {Array.from({ length: 15 }, (_, i) => i + 16).map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
          <option value={31}>Last day of the month</option>
        </select>
      </FormRow>
    </>
  )
}

export function RecurringPage() {
  const { data, openSheet } = useApp()
  const rules = [...data.rules].sort((a, b) => a.createdAt - b.createdAt)
  const groups: { kind: TransactionKind; title: string }[] = [
    { kind: 'income', title: 'Income' }, { kind: 'expense', title: 'Expenses & subscriptions' }, { kind: 'transfer', title: 'Transfers' },
  ]
  return (
    <div className="screen with-nav slide-in">
      <NavBar title="Recurring" right={<button className="link-btn" aria-label="Add recurring" onClick={() => openSheet(<RuleEditor />)}><Plus size={22} /></button>} />
      <div className="stack">
        {!rules.length && (
          <div className="card"><EmptyState icon="repeat" title="No recurring transactions" message="Salary, rent and subscriptions can be added automatically on their dates."
            action="Add recurring" onAction={() => openSheet(<RuleEditor />)} /></div>
        )}
        {groups.map((g) => {
          const items = rules.filter((r) => r.kind === g.kind)
          if (!items.length) return null
          return (
            <div key={g.kind} className="stack-s" style={{ gap: 6 }}>
              <div className="caps">{g.title}</div>
              <div className="card list">
                {items.map((r) => {
                  const cat = data.categories.find((c) => c.id === r.categoryId)
                  const next = r.active ? nextOccurrence(r.startDate, r.frequency, r.generatedCount, r.endDate, r.days ?? null) : null
                  const freq = r.frequency === 'semimonthly' ? `Twice a month (${describePaydays(r.days ?? DEFAULT_PAYDAYS)})` : FREQUENCIES.find((f) => f.id === r.frequency)?.title
                  return (
                    <button key={r.id} className="list-row" onClick={() => openSheet(<RuleEditor rule={r} />)}>
                      <CatIcon icon={cat?.icon ?? (r.kind === 'transfer' ? 'transfer' : 'repeat')} color={cat?.color ?? '#38CFFF'} />
                      <div className="main">
                        <div className="title" style={{ color: r.active ? undefined : 'var(--slate)' }}>{r.title}</div>
                        <div className="sub">{freq} · {next ? `next ${fmtDay(next)}` : r.active ? 'ended' : 'paused'}</div>
                      </div>
                      <Amount className="end" value={r.kind === 'expense' ? -r.amount : r.amount} currency={r.currency} signed={r.kind === 'income'} />
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
        {!!rules.length && <Footnote>Due occurrences are posted when you open the app — including any missed while it was closed. Deleting a rule keeps transactions already posted.</Footnote>}
      </div>
    </div>
  )
}

export function RuleEditor({ rule }: { rule?: RecurringRule }) {
  const { data, closeSheet, openSheet, toast } = useApp()
  const accounts = data.accounts.filter((a) => !a.archived)
  const [title, setTitle] = useState(rule?.title ?? '')
  const [kind, setKind] = useState<TransactionKind>(rule?.kind ?? 'expense')
  const [amountText, setAmountText] = useState(rule ? toInput(rule.amount) : '')
  const [currency, setCurrency] = useState<Currency>(rule?.currency ?? accounts[0]?.currency ?? data.settings.primaryCurrency)
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency ?? 'monthly')
  const [days, setDays] = useState<PayDays>(rule?.days ?? DEFAULT_PAYDAYS)
  const [startDate, setStartDate] = useState(rule?.startDate ?? today())
  const [endDate, setEndDate] = useState(rule?.endDate ?? '')
  const [accountId, setAccountId] = useState(rule?.accountId ?? accounts[0]?.id ?? '')
  const [destId, setDestId] = useState(rule?.destAccountId ?? '')
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '')
  const [active, setActive] = useState(rule?.active ?? true)
  const amount = parseAmount(amountText)
  const posted = rule?.generatedCount ?? 0
  const valid = !!amount && amount > 0 && !!accountId && !!title.trim() && (kind !== 'transfer' || (!!destId && destId !== accountId))
  const cats = data.categories.filter((c) => c.kind === (kind === 'income' ? 'income' : 'expense'))

  async function save() {
    if (!valid || !amount) return
    let start = rule && posted > 0 ? rule.startDate : startDate
    let count = posted
    const daysChanged = frequency === 'semimonthly' && (rule?.days ?? DEFAULT_PAYDAYS).join() !== days.join()
    if (rule && posted > 0 && (rule.frequency !== frequency || daysChanged)) {
      // Re-anchor after the last posted occurrence so the new pattern only applies going forward.
      const last = nextOccurrence(rule.startDate, rule.frequency, posted - 1, null, rule.days ?? null) ?? today()
      start = addDays(last, 1)
      count = 0
    }
    await saveRule({
      id: rule?.id ?? newId(), title: title.trim(), kind, amount, currency, frequency, days: frequency === 'semimonthly' ? days : null, startDate: start, endDate: endDate || null,
      generatedCount: count, active, accountId, destAccountId: kind === 'transfer' ? destId : null,
      categoryId: kind === 'transfer' ? null : categoryId || null, createdAt: rule?.createdAt ?? Date.now(),
    })
    const n = await runRecurring()
    haptic()
    closeSheet()
    if (n) toast(`${n} occurrence${n === 1 ? '' : 's'} posted`)
  }

  return (
    <Sheet title={rule ? 'Edit recurring' : 'New recurring'} onSave={save} canSave={valid}>
      <div className="stack">
        <Segmented value={kind} onChange={setKind} options={[{ id: 'expense', title: 'Expense' }, { id: 'income', title: 'Income' }, { id: 'transfer', title: 'Transfer' }]} />
        <FormCard>
          <FormRow label="Name"><input className="field" placeholder="e.g. Salary, Netflix" value={title} onChange={(e) => setTitle(e.target.value)} /></FormRow>
          <FormRow label="Amount">
            <select className="field" style={{ maxWidth: 70 }} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{SYMBOL[c]} {c}</option>)}
            </select>
            <DecimalField value={amountText} onChange={setAmountText} width={150} />
          </FormRow>
        </FormCard>
        <FormCard>
          <FormRow label={kind === 'transfer' ? 'From' : 'Account'}>
            <select className="field" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
            </select>
          </FormRow>
          {kind === 'transfer' ? (
            <FormRow label="To">
              <select className="field" value={destId} onChange={(e) => setDestId(e.target.value)}>
                <option value="">Choose</option>
                {accounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
              </select>
            </FormRow>
          ) : (
            <FormRow label="Category">
              <select className="field" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">None</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormRow>
          )}
        </FormCard>
        <FormCard footer={posted > 0 ? `Changes apply to future occurrences. ${posted} already posted are unchanged.` : startDate <= today() ? 'Occurrences from the first date until today are posted when you save.' : undefined}>
          <FormRow label="Repeats">
            <select className="field" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </FormRow>
          {frequency === 'semimonthly' && <PayDaysRows days={days} onChange={setDays} />}
          <FormRow label={frequency === 'semimonthly' ? 'Starting from' : 'First date'}><input type="date" className="field" disabled={posted > 0} value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} /></FormRow>
          <FormRow label="End date"><input type="date" className="field" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} /></FormRow>
          {rule && <FormRow label="Active"><Switch checked={active} onChange={setActive} label="Active" /></FormRow>}
        </FormCard>
        {rule && (
          <button className="btn-danger" onClick={() => openSheet(
            <Confirm title={`Delete ${rule.title}?`} message="Transactions already posted are kept." confirmLabel="Delete rule"
              onConfirm={async () => { await deleteRule(rule.id); closeSheet() }} />,
          )}>Delete recurring</button>
        )}
      </div>
    </Sheet>
  )
}
