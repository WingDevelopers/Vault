import { useState } from 'react'
import { Bell, Check, ChevronRight, Plus, Repeat } from 'lucide-react'
import { daysBetween, fmtDate, fmtDay, today } from '../core/dates'
import { reminderDue, reminderState } from '../core/finance'
import { DEFAULT_PAYDAYS, FREQUENCIES, type Frequency, type ISODate, type PayDays, type Reminder } from '../core/types'
import { newId } from '../db/db'
import { completeReminder, deleteReminder, saveReminder, uncompleteReminder, undoCompleteReminder } from '../db/repo'
import { haptic, useApp } from '../state'
import { Confirm, EmptyState, Footnote, FormCard, FormRow, NavBar, SectionHeader, Sheet } from '../ui/components'
import { describePaydays, PayDaysRows } from './Manage'

// ---------- helpers ----------

export function dueLabel(d: ISODate): { text: string; tone: 'neg' | 'warn' | 'muted' } {
  const n = daysBetween(today(), d)
  if (n < 0) return { text: n === -1 ? 'Overdue · yesterday' : `Overdue · ${fmtDay(d)}`, tone: 'neg' }
  if (n === 0) return { text: 'Today', tone: 'warn' }
  if (n === 1) return { text: 'Tomorrow', tone: 'muted' }
  if (n < 7) return { text: new Date(`${d}T12:00`).toLocaleDateString('en-US', { weekday: 'long' }), tone: 'muted' }
  return { text: fmtDay(d), tone: 'muted' }
}

const repeatLabel = (r: Reminder) => {
  if (!r.repeat) return null
  if (r.repeat === 'semimonthly') return `Twice a month (${describePaydays(r.days ?? DEFAULT_PAYDAYS)})`
  return FREQUENCIES.find((f) => f.id === r.repeat)?.title ?? ''
}

interface Item { r: Reminder; date: ISODate | null; done: boolean }

/** Pending reminders first (by due date), then ones checked off this cycle (by renewal date). */
function items(reminders: Reminder[]): Item[] {
  const t = today()
  return reminders
    .map((r) => ({ r, ...reminderState(r, t) }))
    // one-offs: keep showing for the day they were checked off
    .filter((x) => !x.done || x.r.repeat || (x.r.doneAt && new Date(x.r.doneAt).toDateString() === new Date().toDateString()))
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1
      const da = a.date ?? '9999', dbb = b.date ?? '9999'
      return da === dbb ? a.r.createdAt - b.r.createdAt : da < dbb ? -1 : 1
    })
}

function useToggle() {
  const { toast } = useApp()
  return async (it: Item) => {
    const r = it.r
    if (it.done) {
      haptic(6)
      await uncompleteReminder(r)
      return
    }
    haptic(12)
    await completeReminder(r)
    const renews = r.repeat ? reminderDue({ ...r, index: r.index + 1 }) : null
    toast(renews ? `Done · renews ${fmtDay(renews)}` : 'Done', { label: 'Undo', run: () => undoCompleteReminder(r) })
  }
}

// ---------- row ----------

function ReminderRow({ it }: { it: Item }) {
  const { openSheet } = useApp()
  const toggle = useToggle()
  const { r, date, done } = it
  const label = done ? { text: date ? `Done · renews ${fmtDay(date)}` : 'Done', tone: 'pos' as const } : date ? dueLabel(date) : { text: '', tone: 'muted' as const }
  return (
    <div className="list-row">
      <button className={`check ${done ? 'done' : ''}`} aria-pressed={done}
        aria-label={done ? `Mark "${r.title}" not done` : `Mark "${r.title}" done`} onClick={() => toggle(it)}>
        <Check size={15} strokeWidth={3} />
      </button>
      <button className="main" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => openSheet(<ReminderEditor reminder={r} />)}>
        <div className="title" style={done ? { color: 'var(--slate)', textDecoration: 'line-through' } : undefined}>{r.title}</div>
        <div className="sub row" style={{ gap: 6 }}>
          <span className={label.tone}>{label.text}</span>
          {r.repeat && <><span>·</span><Repeat size={11} aria-label="Repeats" /><span>{repeatLabel(r)}</span></>}
          {r.note && <><span>·</span><span>{r.note}</span></>}
        </div>
      </button>
    </div>
  )
}

// ---------- Home section ----------

/** "To do" on Home: overdue and next-7-days reminders (or just the next one), plus this cycle's checked-off ones. */
export function RemindersSection() {
  const { data, openSheet, push } = useApp()
  const all = items(data.reminders)
  const pending = all.filter((x) => !x.done)
  const done = all.filter((x) => x.done)
  const soon = pending.filter((x) => x.date && daysBetween(today(), x.date) <= 7)
  const shownPending = (soon.length ? soon : pending.slice(0, 1)).slice(0, 4)
  const shown = [...shownPending, ...done.slice(0, 4)]
  const hiddenCount = pending.length - shownPending.length

  return (
    <div className="stack-s">
      <SectionHeader title="To do">
        <div className="row" style={{ gap: 4 }}>
          {!!data.reminders.length && <button className="link-btn" style={{ fontSize: 15 }} onClick={() => push({ name: 'reminders' })}>See all</button>}
          <button className="link-btn" aria-label="Add reminder" onClick={() => openSheet(<ReminderEditor />)}><Plus size={20} /></button>
        </div>
      </SectionHeader>
      {shown.length ? (
        <div className="card list">
          {shown.map((it) => <ReminderRow key={it.r.id} it={it} />)}
          {hiddenCount > 0 && (
            <button className="list-row muted small" onClick={() => push({ name: 'reminders' })}>
              <span className="main">{hiddenCount} more coming up</span><ChevronRight size={16} />
            </button>
          )}
        </div>
      ) : (
        <button className="card row" style={{ textAlign: 'left' }} onClick={() => openSheet(<ReminderEditor />)}>
          <span className="icon-btn" style={{ flex: 'none' }}><Bell size={17} /></span>
          <span className="small muted">Add reminders like <span style={{ color: 'var(--white)' }}>“Move money to Schwab”</span> — one-off or repeating.</span>
        </button>
      )}
    </div>
  )
}

// ---------- full list ----------

export function RemindersPage() {
  const { data, openSheet } = useApp()
  const all = items(data.reminders)
  const pending = all.filter((x) => !x.done)
  const doneThisCycle = all.filter((x) => x.done)
  const oneOffsDone = data.reminders.filter((r) => !r.repeat && r.doneAt && !doneThisCycle.some((x) => x.r.id === r.id))
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 20)
  return (
    <div className="screen with-nav slide-in">
      <NavBar title="Reminders" back="Overview" right={<button className="link-btn" aria-label="Add reminder" onClick={() => openSheet(<ReminderEditor />)}><Plus size={22} /></button>} />
      <div className="stack">
        {!pending.length && !doneThisCycle.length && (
          <div className="card"><EmptyState icon="star" title="Nothing to do" message="Add reminders for money tasks — moving money to Schwab, investing, paying a card."
            action="Add reminder" onAction={() => openSheet(<ReminderEditor />)} /></div>
        )}
        {!!pending.length && (
          <div className="stack-s" style={{ gap: 6 }}>
            <div className="caps">Upcoming</div>
            <div className="card list">{pending.map((it) => <ReminderRow key={it.r.id} it={it} />)}</div>
          </div>
        )}
        {!!doneThisCycle.length && (
          <div className="stack-s" style={{ gap: 6 }}>
            <div className="caps">Done</div>
            <div className="card list">{doneThisCycle.map((it) => <ReminderRow key={it.r.id} it={it} />)}</div>
          </div>
        )}
        {!!oneOffsDone.length && (
          <div className="stack-s" style={{ gap: 6 }}>
            <div className="caps">Completed earlier</div>
            <div className="card list">
              {oneOffsDone.map((r) => (
                <div key={r.id} className="list-row">
                  <span className="check done" aria-hidden><Check size={15} strokeWidth={3} /></span>
                  <div className="main"><div className="title muted" style={{ textDecoration: 'line-through' }}>{r.title}</div><div className="sub">Due {fmtDate(r.startDate)}</div></div>
                  <button className="link-btn" style={{ fontSize: 14 }} onClick={() => saveReminder({ ...r, doneAt: null })}>Restore</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <Footnote>Repeating reminders stay checked until their next date, then come back unchecked. They show here and on Home — the app can't send phone notifications, since it has no server.</Footnote>
      </div>
    </div>
  )
}

// ---------- editor ----------

export function ReminderEditor({ reminder }: { reminder?: Reminder }) {
  const { closeSheet, openSheet } = useApp()
  const [title, setTitle] = useState(reminder?.title ?? '')
  const [note, setNote] = useState(reminder?.note ?? '')
  const [date, setDate] = useState(reminder ? (reminderDue(reminder) ?? reminder.startDate) : today())
  const [repeat, setRepeat] = useState<Frequency | ''>(reminder?.repeat ?? '')
  const [days, setDays] = useState<PayDays>(reminder?.days ?? DEFAULT_PAYDAYS)
  const valid = !!title.trim()

  async function save() {
    if (!valid) return
    await saveReminder({
      id: reminder?.id ?? newId(), title: title.trim(), note: note.trim(),
      // The schedule restarts from the date shown (the next due date), so past occurrences aren't repeated.
      startDate: date, repeat: repeat || null, days: repeat === 'semimonthly' ? days : null, index: 0,
      doneAt: null, lastDone: null, createdAt: reminder?.createdAt ?? Date.now(),
    })
    haptic()
    closeSheet()
  }

  return (
    <Sheet title={reminder ? 'Edit reminder' : 'New reminder'} onSave={save} canSave={valid} full={false}>
      <div className="stack">
        <FormCard>
          <FormRow label="What"><input className="field" placeholder="e.g. Move money to Schwab" value={title} autoFocus={!reminder} onChange={(e) => setTitle(e.target.value)} /></FormRow>
          <FormRow label="Note"><input className="field" placeholder="Optional, e.g. ₡700,000" value={note} onChange={(e) => setNote(e.target.value)} /></FormRow>
        </FormCard>
        <FormCard footer={repeat ? 'When you mark it done, it moves to the next date.' : undefined}>
          <FormRow label={repeat ? 'Next due' : 'Due'}><input type="date" className="field" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></FormRow>
          <FormRow label="Repeat">
            <select className="field" value={repeat} onChange={(e) => setRepeat(e.target.value as Frequency | '')}>
              <option value="">Never</option>
              {FREQUENCIES.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </FormRow>
          {repeat === 'semimonthly' && <PayDaysRows days={days} onChange={setDays} />}
        </FormCard>
        {reminder && (
          <button className="btn-danger" onClick={() => openSheet(
            <Confirm title={`Delete "${reminder.title}"?`} message={reminder.repeat ? 'All future occurrences are removed.' : 'This reminder is removed.'}
              confirmLabel="Delete reminder" onConfirm={async () => { await deleteReminder(reminder.id); closeSheet() }} />,
          )}>Delete reminder</button>
        )}
      </div>
    </Sheet>
  )
}
