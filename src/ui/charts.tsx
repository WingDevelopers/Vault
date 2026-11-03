import { useMemo, useRef, useState } from 'react'
import type { Point } from '../core/finance'
import { formatCompact } from '../core/money'
import { fmtMonthShort } from '../core/dates'
import type { Cents, Currency } from '../core/types'

/** Smooth path through points (monotone-ish Catmull-Rom → cubic Bézier). */
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const t = 0.18
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t]
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t]
    // clamp control points vertically between endpoints to avoid overshoot
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1])
    c1[1] = Math.min(hi, Math.max(lo, c1[1])); c2[1] = Math.min(hi, Math.max(lo, c2[1]))
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`
  }
  return d
}

/**
 * Area/line chart for monthly points. Optional dashed `secondary` series (e.g. contributions).
 * Touch & drag to inspect a month (calls onSelect).
 */
export function AreaChart({ points, height = 120, color = '#00A8FF', showAxis = true, onSelect, label }: {
  points: Point[]; currency: Currency; height?: number; color?: string; showAxis?: boolean
  onSelect?: (p: Point | null) => void; label: string
}) {
  const W = 340, H = height, padTop = 8, padBottom = showAxis ? 18 : 4
  const [sel, setSel] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const id = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, [])

  const values = points.flatMap((p) => [p.value, ...(p.secondary !== undefined ? [p.secondary] : [])])
  let min = Math.min(...values), max = Math.max(...values)
  if (min === max) { min -= Math.abs(min) * 0.1 || 1; max += Math.abs(max) * 0.1 || 1 }
  const span = max - min
  min -= span * 0.08; max += span * 0.08
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * (W - 8) + 4)
  const y = (v: number) => padTop + (1 - (v - min) / (max - min)) * (H - padTop - padBottom)
  const main = points.map((p, i) => [x(i), y(p.value)] as [number, number])
  const sec = points.some((p) => p.secondary !== undefined) ? points.map((p, i) => [x(i), y(p.secondary ?? 0)] as [number, number]) : null
  const line = smoothPath(main)
  const area = `${line} L${main[main.length - 1][0]},${H - padBottom} L${main[0][0]},${H - padBottom} Z`
  const step = Math.max(1, Math.ceil(points.length / 5))

  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const rel = ((clientX - r.left) / r.width) * W
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((rel - 4) / (W - 8)) * (points.length - 1))))
    setSel(i)
    onSelect?.(points[i])
  }
  const clear = () => { setSel(null); onSelect?.(null) }

  return (
    <svg ref={ref} className="chart" viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={label}
      onPointerDown={(e) => pick(e.clientX)} onPointerMove={(e) => (e.buttons || e.pointerType === 'touch') && sel !== null && pick(e.clientX)}
      onPointerUp={clear} onPointerLeave={clear} onPointerCancel={clear}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}l`} x1="0" x2="1">
          <stop offset="0" stopColor="#00A8FF" />
          <stop offset="1" stopColor="#38CFFF" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      {sec && <path d={smoothPath(sec)} fill="none" stroke="#8A9BB3" strokeWidth="1.5" strokeDasharray="4 4" />}
      <path d={line} fill="none" stroke={color === '#00A8FF' ? `url(#${id}l)` : color} strokeWidth="2.5" strokeLinecap="round" />
      {sel !== null && (
        <>
          <line x1={main[sel][0]} x2={main[sel][0]} y1={padTop} y2={H - padBottom} stroke="#8A9BB3" strokeOpacity="0.4" />
          <circle cx={main[sel][0]} cy={main[sel][1]} r="4.5" fill="#38CFFF" stroke="#080F1F" strokeWidth="2" />
        </>
      )}
      {showAxis && points.map((p, i) => (i % step === 0 || i === points.length - 1) && (i === points.length - 1 || points.length - 1 - i >= step / 2) ? (
        <text key={p.month} className="chart-axis" x={x(i)} y={H - 4} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
          {fmtMonthShort(p.month)}
        </text>
      ) : null)}
    </svg>
  )
}

/** Donut chart. */
export function Donut({ slices, size = 120 }: { slices: { value: number; color: string; label: string }[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1
  const r = 46, c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Allocation">
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
      {slices.map((s) => {
        const len = (s.value / total) * c
        const gap = slices.length > 1 ? Math.min(2, len / 3) : 0
        const el = (
          <circle key={s.label} cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth="16" strokeLinecap="butt"
            strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
        )
        offset += len
        return el
      })}
    </svg>
  )
}

/** Horizontal bars with labels and compact values. */
export function BarList({ rows, currency }: { rows: { label: string; value: Cents; color: string }[]; currency: Currency }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="stack-s" style={{ gap: 8 }}>
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          <div className="bar" style={{ width: `${(r.value / max) * 100}%`, background: `linear-gradient(90deg, ${r.color}, ${r.color}aa)` }} />
          <span className="muted num tiny">{formatCompact(r.value, currency)}</span>
        </div>
      ))}
    </div>
  )
}

export const CHART_PALETTE = ['#00A8FF', '#38CFFF', '#35D6A0', '#6C8CFF', '#B794F6', '#FFB86B', '#FF8FB1', '#8A9BB3']
