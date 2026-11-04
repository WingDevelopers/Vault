import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronLeft, Info } from 'lucide-react'
import { formatMoney, groupInput, HIDDEN, nextInput, SYMBOL } from '../core/money'
import type { BudgetStatus } from '../core/finance'
import type { Cents, Currency } from '../core/types'
import { haptic, useApp, useHidden } from '../state'
import { updateSettings } from '../db/repo'
import { viewCurrency } from '../core/types'
import { Icon } from './icons'

// ---------- Money ----------

export function Amount({ value, currency, signed, colored, className = '', style }: {
  value: Cents; currency: Currency; signed?: boolean; colored?: boolean; className?: string; style?: React.CSSProperties
}) {
  const hidden = useHidden()
  const color = colored ? (value > 0 ? 'pos' : value < 0 ? 'neg' : '') : ''
  return (
    <span className={`num ${color} ${className}`} style={style} aria-label={hidden ? 'Hidden amount' : undefined}>
      {hidden ? HIDDEN : formatMoney(value, currency, { signed })}
    </span>
  )
}

export function useMoney() {
  const hidden = useHidden()
  return (v: Cents, c: Currency, signed = false) => (hidden ? HIDDEN : formatMoney(v, c, { signed }))
}

/** Header pill that switches which currency totals are shown in (₡ ⇄ $). */
export function CurrencyToggle() {
  const { data } = useApp()
  const s = data.settings
  const cur = viewCurrency(s)
  const next: Currency = cur === 'CRC' ? 'USD' : 'CRC'
  return (
    <button className="currency-toggle" aria-label={`Showing ${cur}. Switch to ${next}`}
      onClick={() => { haptic(4); updateSettings({ displayCurrency: next }) }}>
      <span className="sym">{SYMBOL[cur]}</span>{cur}
    </button>
  )
}

// ---------- Layout ----------

export function LargeTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="large-title">
      <h1>{title}</h1>
      <div className="row" style={{ gap: 8 }}>{children}</div>
    </header>
  )
}

/** Inline nav bar for pushed pages. */
export function NavBar({ title, back = 'Back', right }: { title: string; back?: string; right?: ReactNode }) {
  const { pop } = useApp()
  return (
    <div className="nav-bar">
      <div className="left">
        <button className="link-btn" onClick={pop}><ChevronLeft size={24} />{back}</button>
      </div>
      <div className="title">{title}</div>
      <div className="right">{right}</div>
    </div>
  )
}

export function SectionHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {children}
    </div>
  )
}

export function Footnote({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return <div className="footnote">{icon ?? <Info size={13} />}<span>{children}</span></div>
}

export function EmptyState({ icon, title, message, action, onAction }: { icon: string; title: string; message: string; action?: string; onAction?: () => void }) {
  return (
    <div className="empty">
      <div className="icon"><Icon name={icon} size={32} strokeWidth={1.6} /></div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action && onAction && <button className="btn-primary compact" style={{ marginTop: 6 }} onClick={onAction}>{action}</button>}
    </div>
  )
}

/** `marker` (0–1) draws a thin tick, e.g. how far through the month we are. */
export function ProgressBar({ fraction, color = 'var(--electric)', height = 8, marker }: { fraction: number; color?: string; height?: number; marker?: number | null }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <div className="progress" style={{ height, position: 'relative' }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ width: `${pct > 0 ? Math.max(pct, 2) : 0}%`, background: color, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.18))' }} />
      {marker != null && marker > 0 && marker < 1 && (
        <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${marker * 100}% - 1px)`, width: 2, background: 'rgba(244,247,252,0.75)', borderRadius: 1 }} />
      )}
    </div>
  )
}

export const statusColor = (s: BudgetStatus) => (s === 'over' ? 'var(--coral)' : s === 'approaching' ? 'var(--amber)' : 'var(--electric)')

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; title: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.title}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  )
}

// ---------- Forms ----------

export function FormCard({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="stack-s" style={{ gap: 6 }}>
      {title && <div className="caps">{title}</div>}
      <div className="form-card">{children}</div>
      {footer && <div className="form-footer">{footer}</div>}
    </div>
  )
}

export function FormRow({ label, icon, children }: { label: ReactNode; icon?: ReactNode; children?: ReactNode }) {
  return (
    <div className="form-row">
      <div className="label">{icon}{label}</div>
      <div className="control">{children}</div>
    </div>
  )
}

export function DecimalField({ value, onChange, placeholder = '0', width }: { value: string; onChange: (v: string) => void; placeholder?: string; width?: number }) {
  return (
    <input className="field num" inputMode="decimal" value={groupInput(value)} placeholder={placeholder} style={width ? { maxWidth: width } : undefined}
      onChange={(e) => onChange(nextInput(value, e.target.value))} />
  )
}

export function AmountInput({ value, onChange, currency, onCurrencyChange, color, autoFocus }: {
  value: string; onChange: (v: string) => void; currency: Currency; onCurrencyChange?: (c: Currency) => void; color?: string; autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) { const t = setTimeout(() => ref.current?.focus(), 350); return () => clearTimeout(t) }
  }, [autoFocus])
  return (
    <div className="amount-input">
      <button type="button" className="sym" aria-label={`Currency ${currency}${onCurrencyChange ? ', tap to switch' : ''}`}
        onClick={() => onCurrencyChange?.(currency === 'CRC' ? 'USD' : 'CRC')}>
        {SYMBOL[currency]}
      </button>
      <input ref={ref} inputMode="decimal" placeholder="0" value={groupInput(value)} aria-label="Amount" style={{ color }}
        onChange={(e) => onChange(nextInput(value, e.target.value))} />
      {onCurrencyChange && <span className="code">{currency}</span>}
    </div>
  )
}

// ---------- Sheets ----------

/** Bottom sheet with iOS-style header. Rendered by <SheetHost/>. */
export function Sheet({ title, onSave, saveLabel = 'Save', canSave = true, children, footer, full = true, cancelLabel = 'Cancel' }: {
  title: string; onSave?: () => void; saveLabel?: string; canSave?: boolean; children: ReactNode; footer?: ReactNode; full?: boolean; cancelLabel?: string
}) {
  const { closeSheet } = useApp()
  return (
    <>
      <div className={`sheet ${full ? 'full' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />
        <div className="sheet-header">
          <div><button className="link-btn" onClick={closeSheet}>{cancelLabel}</button></div>
          <div className="title">{title}</div>
          <div style={{ justifySelf: 'end' }}>
            {onSave && <button className="link-btn strong" disabled={!canSave} onClick={onSave}>{saveLabel}</button>}
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </>
  )
}

export function SheetHost() {
  const { sheets, closeSheet } = useApp()
  return (
    <>
      {sheets.map((s, i) => (
        <div key={i}>
          <div className="sheet-backdrop" onClick={i === sheets.length - 1 ? closeSheet : undefined} />
          {s}
        </div>
      ))}
    </>
  )
}

export function Confirm({ title, message, confirmLabel, onConfirm, destructive = true }: {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; destructive?: boolean
}) {
  const { closeSheet } = useApp()
  return (
    <div className="sheet" role="alertdialog" aria-label={title}>
      <div className="grabber" />
      <div className="sheet-body stack-s" style={{ textAlign: 'center', paddingTop: 16 }}>
        <div className="strong" style={{ fontSize: 17 }}>{title}</div>
        <div className="muted small">{message}</div>
      </div>
      <div className="sheet-footer stack-s">
        <button className={destructive ? 'btn-danger' : 'btn-primary'} onClick={() => { closeSheet(); onConfirm() }}>{confirmLabel}</button>
        <button className="btn-secondary" onClick={closeSheet}>Cancel</button>
      </div>
    </div>
  )
}

export function Toast() {
  const { toastMsg } = useApp()
  if (!toastMsg) return null
  return (
    <div className="toast" role="status">
      {toastMsg.text}
      {toastMsg.action && <button className="toast-action" onClick={toastMsg.action.run}>{toastMsg.action.label}</button>}
    </div>
  )
}
