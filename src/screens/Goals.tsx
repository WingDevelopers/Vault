import { useState } from 'react'
import { CircleCheck, CircleAlert, Ellipsis, Plus } from 'lucide-react'
import { formatMoney, parseAmount, SYMBOL, toInput } from '../core/money'
import { fmtDate, fmtMonth, today } from '../core/dates'
import { projectGoal, type GoalProjection } from '../core/finance'
import { CURRENCIES, type Currency, type Goal } from '../core/types'
import { newId } from '../db/db'
import { deleteGoal, deleteGoalContribution, saveGoal, saveGoalContribution, setPrimaryGoal } from '../db/repo'
import { haptic, useApp } from '../state'
import { Amount, AmountInput, Confirm, DecimalField, EmptyState, Footnote, FormCard, FormRow, LargeTitle, NavBar, ProgressBar, SectionHeader, Sheet, Switch } from '../ui/components'
import { CatIcon, GOAL_ICON_CHOICES, Icon } from '../ui/icons'

const useProjection = (goal: Goal): GoalProjection => {
  const { data } = useApp()
  return projectGoal(goal.target, data.goalContributions.filter((c) => c.goalId === goal.id), goal.monthly, goal.targetDate)
}

export function Goals() {
  const { data, openSheet, push } = useApp()
  const goals = [...data.goals].sort((a, b) => (a.isPrimary === b.isPrimary ? a.createdAt - b.createdAt : a.isPrimary ? -1 : 1))
  return (
    <div className="screen fade-in">
      <LargeTitle title="Goals">
        <button className="icon-btn" aria-label="New goal" onClick={() => openSheet(<GoalEditor />)}><Plus size={18} /></button>
      </LargeTitle>
      <div className="stack-s" style={{ marginTop: 12 }}>
        {!goals.length && (
          <div className="card"><EmptyState icon="star" title="No goals yet"
            message="Create a goal like “The Nest” for a future apartment. Allocate savings to it and see when you'll get there."
            action="Create goal" onAction={() => openSheet(<GoalEditor />)} /></div>
        )}
        {goals.map((g) => <button key={g.id} style={{ textAlign: 'left' }} onClick={() => push({ name: 'goal', id: g.id })}><GoalCard goal={g} /></button>)}
        {!!goals.length && <Footnote>Allocating to a goal earmarks money you already have — it doesn't move it between accounts or change your net worth.</Footnote>}
      </div>
    </div>
  )
}

export function GoalCard({ goal, compact }: { goal: Goal; compact?: boolean }) {
  const p = useProjection(goal)
  const { data } = useApp()
  const parts: string[] = []
  if (p.isComplete) parts.push('Goal reached')
  else {
    parts.push(p.estimatedCompletion ? `Est. ${fmtMonth(p.estimatedCompletion, 'short')}` : 'Add a monthly contribution to see an estimate')
    if (goal.targetDate) parts.push(`target ${fmtMonth(goal.targetDate.slice(0, 7), 'short')}`)
    if (p.onTrack === false && p.requiredMonthly && !data.settings.hideAmounts) parts.push(`needs ${formatMoney(p.requiredMonthly, goal.currency)}/mo`)
  }
  return (
    <div className="card stack-s">
      <div className="row">
        <CatIcon icon={goal.icon} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="strong" style={{ fontSize: 17 }}>{goal.name}</span>
            {goal.isPrimary && !compact && <span className="badge">PRIMARY</span>}
          </div>
          {goal.purpose && <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{goal.purpose}</div>}
        </div>
        <span className={`strong num ${p.isComplete ? 'pos' : ''}`} style={{ fontSize: 20 }}>{Math.round(p.fraction * 100)}%</span>
      </div>
      <ProgressBar fraction={p.fraction} height={10} color={p.isComplete ? 'var(--emerald)' : 'var(--electric)'} />
      <div className="small"><Amount className="strong" value={p.allocated} currency={goal.currency} /> <span className="muted">of</span> <Amount className="muted" value={p.target} currency={goal.currency} /></div>
      <div className={`tiny ${p.onTrack === false ? 'warn' : 'muted'}`}>{parts.join(' · ')}</div>
    </div>
  )
}

export function GoalDetail({ id }: { id: string }) {
  const { data, openSheet, closeSheet, pop } = useApp()
  const goal = data.goals.find((g) => g.id === id)
  if (!goal) return <div className="screen with-nav"><NavBar title="Goal" /><div className="muted">This goal was deleted.</div></div>
  return <GoalDetailInner goal={goal} openSheet={openSheet} closeSheet={closeSheet} pop={pop} />
}

function GoalDetailInner({ goal, openSheet, closeSheet, pop }: { goal: Goal; openSheet: (n: React.ReactNode) => void; closeSheet: () => void; pop: () => void }) {
  const { data } = useApp()
  const p = useProjection(goal)
  const entries = data.goalContributions.filter((c) => c.goalId === goal.id).sort((a, b) => (a.date < b.date ? 1 : -1))
  const menu = (
    <button className="link-btn" aria-label="More" onClick={() => openSheet(
      <Sheet title={goal.name} full={false} cancelLabel="Close">
        <div className="stack-s">
          <button className="btn-secondary" onClick={() => { closeSheet(); openSheet(<GoalEditor goal={goal} />) }}>Edit goal</button>
          <button className="btn-danger" onClick={() => { closeSheet(); openSheet(
            <Confirm title={`Delete ${goal.name}?`} message="Your accounts aren't affected — allocations are only labels." confirmLabel="Delete goal"
              onConfirm={async () => { await deleteGoal(goal.id); pop() }} />) }}>Delete goal</button>
        </div>
      </Sheet>,
    )}><Ellipsis size={22} /></button>
  )
  const row = (label: string, v: number) => <div className="row-between small"><span className="muted">{label}</span><Amount className="strong" value={v} currency={goal.currency} /></div>
  return (
    <div className="screen with-nav slide-in">
      <NavBar title={goal.name} right={menu} />
      <div className="stack">
        <div className="card hero stack-s">
          {goal.purpose && <div className="small muted">{goal.purpose}</div>}
          <Amount className="big-amount rounded" style={{ fontSize: 36 }} value={p.allocated} currency={goal.currency} />
          <ProgressBar fraction={p.fraction} height={12} color={p.isComplete ? 'var(--emerald)' : 'var(--electric)'} />
          {row('Target', p.target)}
          {row('Remaining', p.remaining)}
          {p.monthlyPace !== null && row(p.paceIsPlanned ? 'Planned per month' : 'Recent avg. per month', p.monthlyPace)}
          {p.requiredMonthly !== null && row('Needed per month for target date', p.requiredMonthly)}
          <div className="divider" />
          <div className="row-between">
            <div>
              <div className="tiny muted">Estimated completion</div>
              <div className="strong" style={{ fontSize: 17 }}>{p.isComplete ? 'Reached' : p.estimatedCompletion ? fmtMonth(p.estimatedCompletion) : '—'}</div>
            </div>
            {p.onTrack !== null && !p.isComplete && (
              <span className={`row small strong ${p.onTrack ? 'pos' : 'warn'}`} style={{ gap: 4 }}>
                {p.onTrack ? <CircleCheck size={15} /> : <CircleAlert size={15} />}{p.onTrack ? 'On track' : 'Behind'}
              </span>
            )}
          </div>
          {goal.targetDate && <div className="tiny muted">Target date: {fmtDate(goal.targetDate)}</div>}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button className="btn-primary" onClick={() => openSheet(<AllocationEditor goal={goal} allocate />)}>Allocate</button>
          <button className="btn-secondary" style={{ padding: 16 }} disabled={p.allocated <= 0} onClick={() => openSheet(<AllocationEditor goal={goal} allocate={false} />)}>Release</button>
        </div>

        <div className="stack-s">
          <SectionHeader title="Allocations" />
          {!entries.length ? <div className="card small muted">Nothing allocated yet.</div> : (
            <div className="card list">
              {entries.map((e) => (
                <button key={e.id} className="list-row" onClick={() => openSheet(
                  <Confirm title="Delete this entry?" message="Only the goal's progress changes." confirmLabel="Delete" onConfirm={() => deleteGoalContribution(e.id)} />)}>
                  <div className="main"><div className="title">{e.note || (e.amount >= 0 ? 'Allocated' : 'Released')}</div><div className="sub">{fmtDate(e.date)}</div></div>
                  <Amount className="end" value={e.amount} currency={goal.currency} signed colored />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AllocationEditor({ goal, allocate }: { goal: Goal; allocate: boolean }) {
  const { closeSheet } = useApp()
  const [text, setText] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const v = parseAmount(text)
  return (
    <Sheet title={allocate ? `Allocate to ${goal.name}` : `Release from ${goal.name}`} full={false} canSave={!!v && v > 0}
      onSave={async () => { if (!v) return; await saveGoalContribution({ id: newId(), goalId: goal.id, date, amount: allocate ? v : -v, note }); haptic(); closeSheet() }}>
      <div className="stack">
        <AmountInput value={text} onChange={setText} currency={goal.currency} autoFocus />
        <FormCard>
          <FormRow label="Date"><input type="date" className="field" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></FormRow>
          <FormRow label="Note"><input className="field" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} /></FormRow>
        </FormCard>
      </div>
    </Sheet>
  )
}

export function GoalEditor({ goal }: { goal?: Goal }) {
  const { data, closeSheet } = useApp()
  const [name, setName] = useState(goal?.name ?? '')
  const [purpose, setPurpose] = useState(goal?.purpose ?? '')
  const [icon, setIcon] = useState(goal?.icon ?? 'house')
  const [currency, setCurrency] = useState<Currency>(goal?.currency ?? data.settings.primaryCurrency)
  const [targetText, setTargetText] = useState(goal ? toInput(goal.target) : '')
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '')
  const [monthlyText, setMonthlyText] = useState(goal?.monthly ? toInput(goal.monthly) : '')
  const [startText, setStartText] = useState('')
  const [primary, setPrimary] = useState(goal?.isPrimary ?? data.goals.length === 0)
  const target = parseAmount(targetText)
  const hasEntries = !!goal && data.goalContributions.some((c) => c.goalId === goal.id)
  const valid = !!name.trim() && !!target && target > 0

  async function save() {
    if (!valid || !target) return
    const monthly = parseAmount(monthlyText)
    const g: Goal = {
      id: goal?.id ?? newId(), name: name.trim(), purpose, icon, currency, target, targetDate: targetDate || null,
      monthly: monthly && monthly > 0 ? monthly : null, isPrimary: primary, createdAt: goal?.createdAt ?? Date.now(),
    }
    await saveGoal(g)
    if (primary) await setPrimaryGoal(g.id)
    const start = parseAmount(startText)
    if (!goal && start && start > 0) await saveGoalContribution({ id: newId(), goalId: g.id, date: today(), amount: start, note: 'Starting balance' })
    haptic(); closeSheet()
  }

  return (
    <Sheet title={goal ? 'Edit goal' : 'New goal'} onSave={save} canSave={valid}>
      <div className="stack">
        <FormCard>
          <FormRow label="Name"><input className="field" placeholder="e.g. The Nest" value={name} onChange={(e) => setName(e.target.value)} /></FormRow>
          <FormRow label="Purpose"><input className="field" placeholder="Optional" value={purpose} onChange={(e) => setPurpose(e.target.value)} /></FormRow>
          <FormRow label="Currency">
            <select className="field" value={currency} disabled={hasEntries} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{SYMBOL[c]} {c}</option>)}
            </select>
          </FormRow>
        </FormCard>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {GOAL_ICON_CHOICES.map((i) => (
            <button key={i} aria-label={i} aria-pressed={icon === i} onClick={() => setIcon(i)}
              style={{ height: 46, borderRadius: 12, display: 'grid', placeItems: 'center', background: icon === i ? 'var(--electric)' : 'var(--raised)', color: icon === i ? 'var(--midnight)' : 'var(--white)' }}>
              <Icon name={i} size={20} />
            </button>
          ))}
        </div>
        <FormCard footer="Set the target to the full amount you need — for an apartment that's usually deposit, moving and furnishing costs, not the monthly rent.">
          <FormRow label="Target amount"><span className="muted">{SYMBOL[currency]}</span><DecimalField value={targetText} onChange={setTargetText} width={150} /></FormRow>
          <FormRow label="Target date"><input type="date" className="field" min={today()} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></FormRow>
          <FormRow label="Monthly contribution"><DecimalField value={monthlyText} onChange={setMonthlyText} placeholder="Optional" width={130} /></FormRow>
          {!goal && <FormRow label="Already saved"><DecimalField value={startText} onChange={setStartText} placeholder="Optional" width={130} /></FormRow>}
        </FormCard>
        <FormCard>
          <FormRow label="Primary goal on Home"><Switch checked={primary} onChange={setPrimary} label="Primary goal" /></FormRow>
        </FormCard>
      </div>
    </Sheet>
  )
}
