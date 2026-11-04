import { useState } from 'react'
import { Check, Circle, LockKeyhole, Target, Zap } from 'lucide-react'
import { CURRENCY_NAME, nextInput, parseAmount, parseRate, SYMBOL } from '../core/money'
import { today } from '../core/dates'
import { ACCOUNT_KINDS, CURRENCIES, DEFAULT_PAYDAYS, FREQUENCIES, type AccountKind, type Currency, type Frequency, type PayDays } from '../core/types'
import { occurrence } from '../core/finance'
import { fmtDate } from '../core/dates'
import { PayDaysRows } from './Manage'
import { newId } from '../db/db'
import { runRecurring, saveAccount, saveGoal, saveRule, updateSettings } from '../db/repo'
import { loadDemoData } from '../db/demo'
import { haptic, useApp } from '../state'
import { Amount, DecimalField, Footnote, FormCard, FormRow } from '../ui/components'
import { ACCOUNT_ICON, Icon } from '../ui/icons'

export function BrandMark({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs><linearGradient id="bm" x1="0" x2="1"><stop offset="0" stopColor="#00A8FF" /><stop offset="1" stopColor="#38CFFF" /></linearGradient>
        <linearGradient id="bmbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#13284A" /><stop offset="1" stopColor="#0E1A30" /></linearGradient></defs>
      <rect width="64" height="64" rx="18" fill="url(#bmbg)" stroke="rgba(0,168,255,0.35)" />
      <path d="M13 44 27 31 36 37 51 19" fill="none" stroke="url(#bm)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const LAST = 5

export function Onboarding() {
  const { data, toast } = useApp()
  const accounts = [...data.accounts].sort((a, b) => a.sortOrder - b.sortOrder)
  const [step, setStep] = useState(0)
  const [currency, setCurrency] = useState<Currency>(data.settings.primaryCurrency)
  const [rate, setRate] = useState(data.settings.crcPerUSD)
  const [acc, setAcc] = useState({ name: '', kind: 'bank' as AccountKind, currency: data.settings.primaryCurrency, balance: '' })
  const [income, setIncome] = useState({ name: 'Salary', amount: '', frequency: 'semimonthly' as Frequency, days: DEFAULT_PAYDAYS as PayDays, next: today(), accountId: '' })
  const [allowance, setAllowance] = useState('')
  const [goal, setGoal] = useState({ name: 'The Nest', purpose: 'Future apartment and moving expenses', target: '', date: '' })
  const [busy, setBusy] = useState(false)

  const next = () => { haptic(); setStep((s) => s + 1) }

  async function addAccount() {
    if (!acc.name.trim()) return
    await saveAccount({ id: newId(), name: acc.name.trim(), kind: acc.kind, currency: acc.currency, openingBalance: parseAmount(acc.balance) ?? 0,
      openingDate: today(), archived: false, sortOrder: accounts.length, createdAt: Date.now() })
    setAcc({ ...acc, name: '', balance: '' })
    toast('Account added')
  }

  async function advance() {
    if (step === 1) await updateSettings({ primaryCurrency: currency, crcPerUSD: parseRate(rate) ?? data.settings.crcPerUSD, rateUpdatedAt: today() })
    if (step === 2 && acc.name.trim()) await addAccount()
    if (step === 3) {
      const amount = parseAmount(income.amount)
      const account = accounts.find((a) => a.id === income.accountId) ?? accounts[0]
      if (amount && amount > 0 && account) {
        await saveRule({ id: newId(), title: income.name || 'Salary', kind: 'income', amount, currency: account.currency, frequency: income.frequency,
          days: income.frequency === 'semimonthly' ? income.days : null,
          startDate: income.frequency === 'semimonthly' ? today() : income.next, endDate: null, generatedCount: 0, active: true, accountId: account.id, destAccountId: null,
          categoryId: data.categories.find((c) => c.kind === 'income' && c.name === 'Salary')?.id ?? null, createdAt: Date.now() })
      }
    }
    if (step === 4) {
      const a = parseAmount(allowance)
      if (a && a > 0) await updateSettings({ monthlyAllowance: a, allowanceCurrency: currency })
    }
    if (step === LAST) {
      const t = parseAmount(goal.target)
      if (t && t > 0 && goal.name.trim()) {
        await saveGoal({ id: newId(), name: goal.name.trim(), purpose: goal.purpose, icon: 'house', currency, target: t, targetDate: goal.date || null,
          monthly: null, isPrimary: true, createdAt: Date.now() })
      }
      return finish()
    }
    next()
  }

  async function finish() {
    await updateSettings({ onboarded: true })
    await runRecurring()
    haptic()
  }

  const title = (t: string, s: string) => (
    <div className="stack-s" style={{ gap: 6 }}><h1 style={{ margin: 0, fontSize: 28 }}>{t}</h1><div className="muted">{s}</div></div>
  )

  return (
    <div className="app">
      {step > 0 && (
        <div className="row" style={{ gap: 6, padding: 'calc(var(--safe-top) + 12px) 16px 0' }} aria-label={`Step ${step} of ${LAST}`}>
          {Array.from({ length: LAST }, (_, i) => <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < step ? 'var(--electric)' : 'rgba(255,255,255,0.1)' }} />)}
        </div>
      )}
      <div className="screen" style={{ paddingBottom: 24 }} key={step}>
        <div className="stack slide-in" style={{ paddingTop: 16 }}>
          {step === 0 && (
            <>
              <div style={{ marginTop: 40 }}><BrandMark size={72} /></div>
              <div className="stack-s" style={{ gap: 6 }}>
                <h1 className="rounded" style={{ margin: 0, fontSize: 36 }}>WalletWing</h1>
                <div className="muted" style={{ fontSize: 19 }}>Financial clarity without complexity.</div>
              </div>
              <div className="stack-s" style={{ gap: 18, marginTop: 16 }}>
                {[
                  [<LockKeyhole key="a" />, 'Private by design', 'Everything stays on this device. No accounts, no servers, no tracking.'],
                  [<Zap key="b" />, 'Fast to use', 'Log an expense in a few seconds from any screen.'],
                  [<Target key="c" />, 'Built around progress', 'Net worth, savings rate and goals — understood at a glance.'],
                ].map(([icon, t, s]) => (
                  <div key={String(t)} className="row" style={{ alignItems: 'flex-start' }}>
                    <span className="accent" style={{ width: 30 }}>{icon}</span>
                    <div><div className="strong">{t}</div><div className="small muted">{s}</div></div>
                  </div>
                ))}
              </div>
            </>
          )}
          {step === 1 && (
            <>
              {title('Primary currency', 'Totals on your dashboard are shown in this currency.')}
              {CURRENCIES.map((c) => (
                <button key={c} className="card row" style={{ textAlign: 'left' }} onClick={() => { setCurrency(c); setAcc({ ...acc, currency: c }) }}>
                  <span className="accent strong" style={{ fontSize: 24, width: 32 }}>{SYMBOL[c]}</span>
                  <div style={{ flex: 1 }}><div>{CURRENCY_NAME[c]}</div><div className="small muted">{c}</div></div>
                  {currency === c ? <Check className="accent" /> : <Circle className="muted" />}
                </button>
              ))}
              <FormCard title="Exchange rate" footer="Colones per US dollar. You set this manually and can change it anytime; each transaction records the rate used.">
                <FormRow label="₡ per $1"><DecimalField value={rate} onChange={setRate} placeholder="505" /></FormRow>
              </FormCard>
            </>
          )}
          {step === 2 && (
            <>
              {title('Your accounts', 'Add where your money lives today and its current balance.')}
              {!!accounts.length && (
                <div className="card list">
                  {accounts.map((a) => (
                    <div key={a.id} className="list-row">
                      <span className="accent"><Icon name={ACCOUNT_ICON[a.kind]} /></span>
                      <div className="main title">{a.name}</div>
                      <Amount className="end" value={a.openingBalance} currency={a.currency} />
                    </div>
                  ))}
                </div>
              )}
              <FormCard title={accounts.length ? 'Add another' : 'First account'}>
                <FormRow label="Name"><input className="field" placeholder="e.g. BAC Colones" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} /></FormRow>
                <FormRow label="Type">
                  <select className="field" value={acc.kind} onChange={(e) => setAcc({ ...acc, kind: e.target.value as AccountKind })}>
                    {ACCOUNT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
                  </select>
                </FormRow>
                <FormRow label="Currency">
                  <select className="field" value={acc.currency} onChange={(e) => setAcc({ ...acc, currency: e.target.value as Currency })}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{SYMBOL[c]} {c}</option>)}
                  </select>
                </FormRow>
                <FormRow label="Balance"><span className="muted">{SYMBOL[acc.currency]}</span><DecimalField value={acc.balance} onChange={(v) => setAcc({ ...acc, balance: v })} /></FormRow>
              </FormCard>
              <button className="btn-secondary" disabled={!acc.name.trim()} onClick={addAccount}>+ Add account</button>
            </>
          )}
          {step === 3 && (
            <>
              {title('Recurring income', 'Your salary will be recorded automatically on payday. Optional.')}
              <FormCard>
                <FormRow label="Name"><input className="field" value={income.name} onChange={(e) => setIncome({ ...income, name: e.target.value })} /></FormRow>
                <FormRow label="Amount"><DecimalField value={income.amount} onChange={(v) => setIncome({ ...income, amount: v })} /></FormRow>
                <FormRow label="Every">
                  <select className="field" value={income.frequency} onChange={(e) => setIncome({ ...income, frequency: e.target.value as Frequency })}>
                    {FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
                  </select>
                </FormRow>
                {income.frequency === 'semimonthly' ? (
                  <>
                    <PayDaysRows days={income.days} onChange={(d) => setIncome({ ...income, days: d })} />
                    <FormRow label="Next payday"><span className="muted">{fmtDate(occurrence(0, today(), 'semimonthly', income.days))}</span></FormRow>
                  </>
                ) : (
                  <FormRow label="Next payday"><input type="date" className="field" min={today()} value={income.next} onChange={(e) => e.target.value && setIncome({ ...income, next: e.target.value })} /></FormRow>
                )}
                <FormRow label="Paid into">
                  <select className="field" value={income.accountId || accounts[0]?.id || ''} onChange={(e) => setIncome({ ...income, accountId: e.target.value })}>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}
                  </select>
                </FormRow>
              </FormCard>
              {!accounts.length && <Footnote>Add an account first to set up recurring income — or skip and do it later from Activity → Recurring.</Footnote>}
            </>
          )}
          {step === 4 && (
            <>
              {title('Monthly spending', 'Optionally set one allowance for everything you spend in a month.')}
              <div className="amount-input"><span className="sym">{SYMBOL[currency]}</span>
                <input inputMode="decimal" placeholder="0" value={allowance} onChange={(e) => setAllowance(nextInput(allowance, e.target.value))} aria-label="Monthly allowance" /></div>
              <Footnote>You can add category budgets later. Unused amounts don't roll over unless you turn that on.</Footnote>
            </>
          )}
          {step === 5 && (
            <>
              {title('A first goal', 'What are you saving toward? Optional.')}
              <FormCard footer="Use the full amount you'll need — deposit, moving and furnishing — not the monthly rent.">
                <FormRow label="Name"><input className="field" value={goal.name} onChange={(e) => setGoal({ ...goal, name: e.target.value })} /></FormRow>
                <FormRow label="Purpose"><input className="field" placeholder="Optional" value={goal.purpose} onChange={(e) => setGoal({ ...goal, purpose: e.target.value })} /></FormRow>
                <FormRow label="Target"><span className="muted">{SYMBOL[currency]}</span><DecimalField value={goal.target} onChange={(v) => setGoal({ ...goal, target: v })} /></FormRow>
                <FormRow label="Target date"><input type="date" className="field" min={today()} value={goal.date} onChange={(e) => setGoal({ ...goal, date: e.target.value })} /></FormRow>
              </FormCard>
            </>
          )}
        </div>
      </div>
      <div className="sheet-footer stack-s">
        <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { await advance() } finally { setBusy(false) } }}>
          {step === 0 ? 'Get started' : step === LAST ? 'Finish' : step === 2 && !accounts.length && !acc.name.trim() ? 'Skip for now' : 'Continue'}
        </button>
        {step === 0 ? (
          <button className="link-btn" style={{ fontSize: 15, color: 'var(--slate)', alignSelf: 'center' }} disabled={busy}
            onClick={async () => { setBusy(true); await loadDemoData(); setBusy(false) }}>Explore with demo data</button>
        ) : (
          <div className="row-between">
            <button className="link-btn" style={{ fontSize: 15, color: 'var(--slate)' }} onClick={() => setStep(step - 1)}>Back</button>
            {step >= 3 && <button className="link-btn" style={{ fontSize: 15, color: 'var(--slate)' }} onClick={() => (step === LAST ? finish() : next())}>Skip</button>}
          </div>
        )}
      </div>
    </div>
  )
}
